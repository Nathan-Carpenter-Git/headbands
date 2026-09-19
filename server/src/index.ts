import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { LobbyManager } from "./LobbyManager.js";
import { attachWsServer } from "./wsServer.js";

const PORT = Number(process.env.PORT ?? 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// In production this server also serves the built client, so the whole app is one deployable
// service on one origin (no separate static host, no cross-origin WebSocket config needed).
// In local dev the client runs on its own Vite dev server instead, and client/dist won't exist.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const lobbyManager = new LobbyManager();

attachWsServer(wss, lobbyManager);

server.listen(PORT, () => {
  console.log(`Headbands server listening on http://localhost:${PORT}`);
});
