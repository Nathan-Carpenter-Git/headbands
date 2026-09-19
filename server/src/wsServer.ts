import type { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage, CategorySummaryDTO } from "@headbands/shared";
import { LobbyError, LobbyManager, type Lobby } from "./LobbyManager.js";
import { baseCategories } from "./baseCategories.js";

interface ConnectionMeta {
  code: string;
  playerId: string;
}

const categorySummaries: CategorySummaryDTO[] = baseCategories.map((c) => ({
  id: c.id,
  name: c.name,
  cardCount: c.cards.length,
}));

const HEARTBEAT_INTERVAL_MS = 30_000;
// How long a disconnected player's seat, score, and mid-round place are held for them - long
// enough to cover a locked phone or a brief network drop, short enough that a genuinely gone
// player doesn't block the game forever.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 2 * 60_000);

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function pendingKey(code: string, playerId: string): string {
  return `${code}:${playerId}`;
}

export function attachWsServer(wss: WebSocketServer, lobbyManager: LobbyManager): void {
  const connections = new WeakMap<WebSocket, ConnectionMeta>();
  // Scheduled full-removals for players currently in their reconnect grace period, keyed by
  // "code:playerId" so a resume can find and cancel the one that applies to it.
  const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();

  // A network drop, sleeping laptop, or force-closed tab doesn't always fire a clean 'close'
  // event - the socket can just go silent. Ping everyone periodically and terminate any
  // connection that didn't answer the previous ping, so its lobby seat actually frees up
  // instead of sitting there as a permanently "connected" ghost player.
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));

    send(ws, { type: "categories", categories: categorySummaries });

    ws.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Malformed message" });
        return;
      }

      try {
        handleMessage(ws, message, lobbyManager, connections, pendingRemovals);
      } catch (err) {
        const text = err instanceof LobbyError ? err.message : "Something went wrong";
        send(ws, { type: "error", message: text });
      }
    });

    ws.on("close", () => {
      const meta = connections.get(ws);
      if (!meta) return;
      connections.delete(ws);
      const lobby = lobbyManager.getLobby(meta.code);
      if (!lobby) return;

      // Don't evict them immediately - just mark them disconnected and let everyone else know,
      // then give them a window to reconnect (resumeSession) before actually removing them.
      lobbyManager.markDisconnected(lobby, meta.playerId);
      lobbyManager.broadcastGameState(lobby);

      const key = pendingKey(meta.code, meta.playerId);
      const timer = setTimeout(() => {
        pendingRemovals.delete(key);
        const stillLobby = lobbyManager.getLobby(meta.code);
        if (!stillLobby) return;
        const deleted = lobbyManager.removePlayer(stillLobby, meta.playerId);
        if (!deleted) {
          lobbyManager.broadcastGameState(stillLobby);
        }
      }, RECONNECT_GRACE_MS);
      pendingRemovals.set(key, timer);
    });
  });
}

/**
 * A connection stays open for the app's whole lifetime, so a player can create or join a
 * lobby, then later create or join another one on that same connection (e.g. navigating
 * back home). Without this, the old lobby would keep them as a permanently-connected
 * "ghost" player forever, since their socket never actually closes.
 */
function leaveCurrentLobby(
  ws: WebSocket,
  connections: WeakMap<WebSocket, ConnectionMeta>,
  lobbyManager: LobbyManager,
  pendingRemovals: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const meta = connections.get(ws);
  if (!meta) return;
  connections.delete(ws);
  const key = pendingKey(meta.code, meta.playerId);
  const timer = pendingRemovals.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(key);
  }
  const lobby = lobbyManager.getLobby(meta.code);
  if (!lobby) return;
  const deleted = lobbyManager.removePlayer(lobby, meta.playerId);
  if (!deleted) {
    lobbyManager.broadcastGameState(lobby);
  }
}

function handleMessage(
  ws: WebSocket,
  message: ClientMessage,
  lobbyManager: LobbyManager,
  connections: WeakMap<WebSocket, ConnectionMeta>,
  pendingRemovals: Map<string, ReturnType<typeof setTimeout>>,
): void {
  switch (message.type) {
    case "createLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager, pendingRemovals);
      const { lobby, playerId, token } = lobbyManager.createLobby(message.playerName, ws);
      connections.set(ws, { code: lobby.code, playerId });
      send(ws, { type: "joined", playerId, token, lobby: lobbyManager.toDTO(lobby) });
      return;
    }
    case "joinLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager, pendingRemovals);
      const { lobby, playerId, token } = lobbyManager.joinLobby(message.code, message.playerName, ws);
      connections.set(ws, { code: lobby.code, playerId });
      send(ws, { type: "joined", playerId, token, lobby: lobbyManager.toDTO(lobby) });
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "resumeSession": {
      const lobby = lobbyManager.resumeSession(message.code, message.playerId, message.token, ws);
      connections.set(ws, { code: lobby.code, playerId: message.playerId });
      const key = pendingKey(lobby.code, message.playerId);
      const timer = pendingRemovals.get(key);
      if (timer) {
        clearTimeout(timer);
        pendingRemovals.delete(key);
      }
      send(ws, {
        type: "resumed",
        playerId: message.playerId,
        lobby: lobbyManager.toDTO(lobby),
        round: lobby.phase === "round" ? lobbyManager.toRoundStateDTO(lobby, message.playerId) : null,
        results: lobby.phase === "results" ? lobbyManager.toRoundResultsDTO(lobby) : null,
      });
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "leaveLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager, pendingRemovals);
      return;
    }
    case "uploadCategory": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.uploadCategory(lobby, meta.playerId, message.category);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "updateSettings": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.updateSettings(lobby, meta.playerId, message.settings);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "startRound": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.startRound(lobby, meta.playerId);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "swapCard": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.swapCard(lobby, meta.playerId);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "revealCard": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.revealCard(lobby, meta.playerId);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "playAgain": {
      const { lobby, meta } = requireLobby(connections, lobbyManager, ws);
      lobbyManager.playAgain(lobby, meta.playerId);
      lobbyManager.broadcastGameState(lobby);
      return;
    }
  }
}

function requireLobby(
  connections: WeakMap<WebSocket, ConnectionMeta>,
  lobbyManager: LobbyManager,
  ws: WebSocket,
): { lobby: Lobby; meta: ConnectionMeta } {
  const meta = connections.get(ws);
  if (!meta) {
    throw new LobbyError("Join a lobby first");
  }
  const lobby = lobbyManager.getLobby(meta.code);
  if (!lobby) {
    throw new LobbyError("Lobby no longer exists");
  }
  return { lobby, meta };
}
