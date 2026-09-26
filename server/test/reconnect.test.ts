import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, LobbyStateDTO, ServerMessage } from "@headbands/shared";
import { LobbyManager } from "../src/LobbyManager.js";
import { attachWsServer } from "../src/wsServer.js";

const GRACE_MS = 300;

let wss: WebSocketServer;
let url: string;

before(async () => {
  wss = new WebSocketServer({ port: 0 });
  await once(wss, "listening");
  attachWsServer(wss, new LobbyManager(), { reconnectGraceMs: GRACE_MS });
  url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
});

after(() => {
  for (const client of wss.clients) client.terminate();
  wss.close();
});

interface Client {
  ws: WebSocket;
  messages: ServerMessage[];
}

async function connect(): Promise<Client> {
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(ws, "open");
  return { ws, messages };
}

function send(client: Client, message: ClientMessage): void {
  client.ws.send(JSON.stringify(message));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latest<T extends ServerMessage["type"]>(client: Client, type: T): Extract<ServerMessage, { type: T }> {
  const found = client.messages.findLast((m) => m.type === type);
  assert.ok(found, `expected a ${type} message`);
  return found as Extract<ServerMessage, { type: T }>;
}

function playersSeenBy(client: Client): Pick<LobbyStateDTO["players"][number], "name" | "connected">[] {
  return latest(client, "lobbyState").lobby.players.map(({ name, connected }) => ({ name, connected }));
}

/** A leader plus a second player "Bob", with Bob's saved session details. */
async function lobbyWithBob() {
  const leader = await connect();
  send(leader, { type: "createLobby", playerName: "Leader" });
  await wait(50);
  const code = latest(leader, "joined").lobby.code;

  const bob = await connect();
  send(bob, { type: "joinLobby", code, playerName: "Bob" });
  await wait(50);
  const { playerId, token } = latest(bob, "joined");
  return { leader, bob, session: { code, playerId, token } };
}

test("a stale socket closing after the player resumed elsewhere doesn't disconnect them", async () => {
  const { leader, bob, session } = await lobbyWithBob();

  // Bob's browser gives up on its socket and resumes on a new one before the server has
  // noticed the old socket is dead (a half-open connection after a network blip).
  const bobAgain = await connect();
  send(bobAgain, { type: "resumeSession", ...session });
  await wait(50);
  assert.equal(latest(bobAgain, "resumed").playerId, session.playerId);

  // The server finally sees the old socket close.
  bob.ws.terminate();
  await wait(GRACE_MS * 2);

  assert.deepEqual(playersSeenBy(leader), [
    { name: "Leader", connected: true },
    { name: "Bob", connected: true },
  ]);
  assert.equal(bobAgain.ws.readyState, WebSocket.OPEN);

  // And Bob's new socket is still the one wired to his seat.
  send(bobAgain, { type: "leaveLobby" });
  await wait(50);
  assert.deepEqual(playersSeenBy(leader), [{ name: "Leader", connected: true }]);
});

test("resuming on a new socket closes the socket it replaced", { timeout: 2000 }, async () => {
  const { bob, session } = await lobbyWithBob();

  const bobAgain = await connect();
  const replacedClosed = once(bob.ws, "close");
  send(bobAgain, { type: "resumeSession", ...session });
  await replacedClosed;
});

test("a real drop still shows as reconnecting and frees the seat after the grace period", async () => {
  const { leader, bob } = await lobbyWithBob();

  bob.ws.terminate();
  await wait(50);
  assert.deepEqual(playersSeenBy(leader), [
    { name: "Leader", connected: true },
    { name: "Bob", connected: false },
  ]);

  await wait(GRACE_MS * 2);
  assert.deepEqual(playersSeenBy(leader), [{ name: "Leader", connected: true }]);
});
