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

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

export function attachWsServer(wss: WebSocketServer, lobbyManager: LobbyManager): void {
  const connections = new WeakMap<WebSocket, ConnectionMeta>();

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
        handleMessage(ws, message, lobbyManager, connections);
      } catch (err) {
        const text = err instanceof LobbyError ? err.message : "Something went wrong";
        send(ws, { type: "error", message: text });
      }
    });

    ws.on("close", () => {
      leaveCurrentLobby(ws, connections, lobbyManager);
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
): void {
  const meta = connections.get(ws);
  if (!meta) return;
  connections.delete(ws);
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
): void {
  switch (message.type) {
    case "createLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager);
      const { lobby, playerId } = lobbyManager.createLobby(message.playerName, ws);
      connections.set(ws, { code: lobby.code, playerId });
      send(ws, { type: "joined", playerId, lobby: lobbyManager.toDTO(lobby) });
      return;
    }
    case "joinLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager);
      const { lobby, playerId } = lobbyManager.joinLobby(message.code, message.playerName, ws);
      connections.set(ws, { code: lobby.code, playerId });
      send(ws, { type: "joined", playerId, lobby: lobbyManager.toDTO(lobby) });
      lobbyManager.broadcastGameState(lobby);
      return;
    }
    case "leaveLobby": {
      leaveCurrentLobby(ws, connections, lobbyManager);
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
