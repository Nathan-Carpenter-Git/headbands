import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage, SpybandsRoundResultsDTO, SpybandsRoundStateDTO } from "@headbands/shared";
import { LobbyManager } from "../src/LobbyManager.js";
import { attachWsServer } from "../src/wsServer.js";
import { baseCategories } from "../src/baseCategories.js";

const LOCK_IN_MS = 200;
const GRACE_MS = 150;

let wss: WebSocketServer;
let url: string;

before(async () => {
  wss = new WebSocketServer({ port: 0 });
  await once(wss, "listening");
  attachWsServer(wss, new LobbyManager({ spyLockInMs: LOCK_IN_MS }), { reconnectGraceMs: GRACE_MS });
  url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
});

after(() => {
  for (const client of wss.clients) client.terminate();
  wss.close();
});

interface Client {
  name: string;
  ws: WebSocket;
  messages: ServerMessage[];
  playerId: string;
}

async function connect(name: string): Promise<Client> {
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(ws, "open");
  return { name, ws, messages, playerId: "" };
}

function send(client: Client, message: ClientMessage): void {
  client.ws.send(JSON.stringify(message));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latest<T extends ServerMessage["type"]>(client: Client, type: T): Extract<ServerMessage, { type: T }> {
  const found = client.messages.findLast((m) => m.type === type);
  assert.ok(found, `expected a ${type} message for ${client.name}`);
  return found as Extract<ServerMessage, { type: T }>;
}

function round(client: Client): SpybandsRoundStateDTO {
  const r = latest(client, "roundState").round;
  assert.equal(r.mode, "spybands");
  return r;
}

function results(client: Client): SpybandsRoundResultsDTO {
  const r = latest(client, "roundResults").results;
  assert.equal(r.mode, "spybands");
  return r;
}

function phase(client: Client) {
  return latest(client, "lobbyState").lobby.phase;
}

/** A Spybands lobby with `count` players, leader first, set up but not started. */
async function spybandsLobby(count: number): Promise<Client[]> {
  const leader = await connect("P1");
  send(leader, { type: "createLobby", playerName: "P1" });
  await wait(30);
  const joined = latest(leader, "joined");
  leader.playerId = joined.playerId;
  const clients = [leader];
  for (let i = 2; i <= count; i++) {
    const c = await connect(`P${i}`);
    send(c, { type: "joinLobby", code: joined.lobby.code, playerName: `P${i}` });
    await wait(30);
    c.playerId = latest(c, "joined").playerId;
    clients.push(c);
  }
  send(leader, { type: "updateSettings", settings: { gameMode: "spybands", categoryIds: [baseCategories[0].id], rounds: 2 } });
  await wait(30);
  return clients;
}

async function startRound(clients: Client[]): Promise<{ spy: Client; others: Client[] }> {
  send(clients[0], { type: "startRound" });
  await wait(50);
  const spy = clients.find((c) => round(c).isSpy);
  assert.ok(spy, "someone should be the spy");
  return { spy, others: clients.filter((c) => c !== spy) };
}

async function everyoneReady(clients: Client[]): Promise<void> {
  for (const c of clients) send(c, { type: "spyReady", ready: true });
  await wait(50);
}

test("Spybands needs at least 3 players", async () => {
  const [leader] = await spybandsLobby(2);
  send(leader, { type: "startRound" });
  await wait(30);
  assert.equal(latest(leader, "error").message, "Spybands needs at least 3 players");
  assert.equal(phase(leader), "lobby");
});

test("exactly one spy, who can't see the shared card that everyone else sees", async () => {
  const clients = await spybandsLobby(4);
  const { spy, others } = await startRound(clients);

  assert.equal(round(spy).card, null);
  const card = round(others[0]).card;
  assert.ok(card);
  for (const c of others) {
    assert.equal(round(c).isSpy, false);
    assert.equal(round(c).card, card);
  }
  assert.equal(round(spy).stage, "choosing");
  assert.equal(round(spy).majority, 3);
});

test("a card swap needs more than half the players, and resets everyone's readiness", async () => {
  const clients = await spybandsLobby(4);
  const { others } = await startRound(clients);
  const firstCard = round(others[0]).card;

  send(clients[3], { type: "spyReady", ready: true });
  send(clients[0], { type: "spyVoteSwap", vote: true });
  send(clients[1], { type: "spyVoteSwap", vote: true });
  await wait(50);
  // 2 of 4 is exactly half, not more than half.
  assert.equal(round(others[0]).card, firstCard);
  assert.equal(round(clients[0]).players.filter((p) => p.votedSwap).length, 2);

  send(clients[2], { type: "spyVoteSwap", vote: true });
  await wait(50);
  const secondCard = round(others[0]).card;
  assert.notEqual(secondCard, firstCard);
  for (const p of round(clients[0]).players) {
    assert.equal(p.votedSwap, false);
    assert.equal(p.ready, false);
  }
  for (const c of others) assert.equal(round(c).card, secondCard);
});

test("voting to swap takes back a ready, and readying takes back a swap vote", async () => {
  const clients = await spybandsLobby(3);
  await startRound(clients);
  const me = () => round(clients[0]).players.find((p) => p.id === clients[0].playerId)!;

  send(clients[0], { type: "spyReady", ready: true });
  await wait(30);
  assert.deepEqual([me().ready, me().votedSwap], [true, false]);

  send(clients[0], { type: "spyVoteSwap", vote: true });
  await wait(30);
  assert.deepEqual([me().ready, me().votedSwap], [false, true]);

  send(clients[0], { type: "spyReady", ready: true });
  await wait(30);
  assert.deepEqual([me().ready, me().votedSwap], [true, false]);
});

test("voting only opens once everyone is ready", async () => {
  const clients = await spybandsLobby(3);
  await startRound(clients);

  send(clients[0], { type: "spyAccuse", targetId: clients[1].playerId });
  await wait(30);
  assert.equal(latest(clients[0], "error").message, "Voting hasn't started yet");

  send(clients[0], { type: "spyReady", ready: true });
  send(clients[1], { type: "spyReady", ready: true });
  await wait(30);
  assert.equal(round(clients[0]).stage, "choosing");

  send(clients[2], { type: "spyReady", ready: true });
  await wait(30);
  assert.equal(round(clients[0]).stage, "voting");

  send(clients[0], { type: "spyVoteSwap", vote: true });
  await wait(30);
  assert.equal(latest(clients[0], "error").message, "The card is already locked in");
});

test("a majority vote on the spy counts down, then reveals roles and the card to the spy", async () => {
  const clients = await spybandsLobby(4);
  const { spy, others } = await startRound(clients);
  const card = round(others[0]).card;
  await everyoneReady(clients);

  for (const c of others) send(c, { type: "spyAccuse", targetId: spy.playerId });
  await wait(30);
  const lockIn = round(spy).lockIn;
  assert.equal(lockIn?.targetId, spy.playerId);
  assert.ok(lockIn.remainingMs > 0 && lockIn.remainingMs <= LOCK_IN_MS);
  assert.equal(phase(spy), "round");

  await wait(LOCK_IN_MS + 50);
  assert.equal(phase(spy), "results");
  const r = results(spy);
  assert.equal(r.outcome, "caught");
  assert.equal(r.card, card);
  assert.equal(r.spyName, spy.name);
  assert.equal(r.accusedName, spy.name);
  const spyRow = r.players.find((p) => p.playerId === spy.playerId)!;
  assert.deepEqual([spyRow.isSpy, spyRow.votesReceived, spyRow.pointsAwarded], [true, 3, 0]);
  for (const c of others) {
    const row = r.players.find((p) => p.playerId === c.playerId)!;
    assert.deepEqual([row.isSpy, row.pointsAwarded], [false, 1]);
  }
  const scores = new Map(latest(spy, "lobbyState").lobby.players.map((p) => [p.id, p.score]));
  assert.equal(scores.get(spy.playerId), 0);
  for (const c of others) assert.equal(scores.get(c.playerId), 1);
});

test("voting out an innocent player lets the spy escape with 2 points", async () => {
  const clients = await spybandsLobby(3);
  const { spy, others } = await startRound(clients);
  await everyoneReady(clients);

  const [innocent, other] = others;
  send(spy, { type: "spyAccuse", targetId: innocent.playerId });
  send(other, { type: "spyAccuse", targetId: innocent.playerId });
  await wait(LOCK_IN_MS + 80);

  const r = results(spy);
  assert.equal(r.outcome, "escaped");
  assert.equal(r.accusedName, innocent.name);
  assert.equal(r.players.find((p) => p.playerId === spy.playerId)!.pointsAwarded, 2);
  for (const c of others) assert.equal(r.players.find((p) => p.playerId === c.playerId)!.pointsAwarded, 0);
});

test("losing the majority during the countdown cancels it", async () => {
  const clients = await spybandsLobby(3);
  await startRound(clients);
  await everyoneReady(clients);

  send(clients[0], { type: "spyAccuse", targetId: clients[2].playerId });
  send(clients[1], { type: "spyAccuse", targetId: clients[2].playerId });
  await wait(30);
  assert.equal(round(clients[0]).lockIn?.targetId, clients[2].playerId);

  send(clients[1], { type: "spyAccuse", targetId: null });
  await wait(30);
  assert.equal(round(clients[0]).lockIn, null);

  await wait(LOCK_IN_MS + 50);
  assert.equal(phase(clients[0]), "round");
});

test("nobody can vote for themselves", async () => {
  const clients = await spybandsLobby(3);
  await startRound(clients);
  await everyoneReady(clients);

  send(clients[0], { type: "spyAccuse", targetId: clients[0].playerId });
  await wait(30);
  assert.equal(latest(clients[0], "error").message, "You can't vote for yourself");
});

test("the round is called off with no points if the spy leaves for good", async () => {
  const clients = await spybandsLobby(4);
  const { spy, others } = await startRound(clients);

  spy.ws.terminate();
  await wait(GRACE_MS + 80);

  assert.equal(phase(others[0]), "results");
  const r = results(others[0]);
  assert.equal(r.outcome, "spyLeft");
  assert.equal(r.spyName, spy.name);
  assert.ok(r.players.every((p) => p.pointsAwarded === 0));
});

test("an innocent player leaving shrinks the majority, which can finish a pending swap", async () => {
  const clients = await spybandsLobby(4);
  const { spy, others } = await startRound(clients);
  const firstCard = round(others[0]).card;
  const [a, b, leaver] = others;

  send(a, { type: "spyVoteSwap", vote: true });
  send(spy, { type: "spyVoteSwap", vote: true });
  await wait(30);
  assert.equal(round(a).card, firstCard);

  // 2 of 3 remaining is a majority.
  leaver.ws.terminate();
  await wait(GRACE_MS + 80);
  assert.equal(phase(a), "round");
  assert.equal(round(a).majority, 2);
  assert.notEqual(round(a).card, firstCard);
  assert.equal(round(b).card, round(a).card);
});

test("the round is called off if it drops below 3 players", async () => {
  const clients = await spybandsLobby(3);
  const { spy, others } = await startRound(clients);

  others[0].ws.terminate();
  await wait(GRACE_MS + 80);
  assert.equal(phase(spy), "results");
  assert.equal(results(spy).outcome, "tooFewPlayers");
});

test("the game mode can't change mid-game", async () => {
  const clients = await spybandsLobby(3);
  const { spy, others } = await startRound(clients);
  await everyoneReady(clients);
  for (const c of others) send(c, { type: "spyAccuse", targetId: spy.playerId });
  await wait(LOCK_IN_MS + 80);
  assert.equal(phase(clients[0]), "results");

  send(clients[0], { type: "updateSettings", settings: { gameMode: "headbands" } });
  await wait(30);
  assert.equal(latest(clients[0], "error").message, "Can't switch game modes in the middle of a game");

  // The next round is still Spybands, and play again frees the mode up.
  send(clients[0], { type: "startRound" });
  await wait(50);
  assert.equal(round(clients[0]).roundNumber, 2);
  assert.equal(round(clients[0]).stage, "choosing");
});

test("a resumed spy still can't see the card", async () => {
  const clients = await spybandsLobby(3);
  const { spy } = await startRound(clients);
  const { playerId, token } = latest(spy, "joined");
  const code = latest(spy, "lobbyState").lobby.code;

  const spyAgain = await connect(spy.name);
  send(spyAgain, { type: "resumeSession", code, playerId, token });
  await wait(50);
  const resumed = latest(spyAgain, "resumed");
  assert.equal(resumed.round?.mode, "spybands");
  assert.equal(resumed.round.isSpy, true);
  assert.equal(resumed.round.card, null);
});
