# Headbands

An online version of the classic "guess the card on your own forehead" party game.
Create a lobby, share the invite link, and everyone can see the card on your head except you.
Ask yes/no questions out loud over a voice call (Discord, FaceTime, whatever you use), then reveal once you've got it.

See [RULES.md](./RULES.md) for how to play.

## Project layout

This is an npm workspaces monorepo:

- `client/` — React + Vite frontend.
- `server/` — Node.js + Express + WebSocket backend. Holds all game state in memory, no database.
- `shared/` — TypeScript types and the WebSocket message contract used by both sides.

## Running it locally

```bash
npm install
npm run dev
```

This builds `shared` once, then runs `shared` in watch mode alongside the client (Vite dev server) and server (auto-restarting on change) together.
The client runs at `http://localhost:5173` and talks to the server on `http://localhost:8080`.

## Production build

```bash
npm run build
npm start
```

In production the server also serves the built client, so the whole app is a single deployable service on one port (no separate static host, no cross-origin WebSocket config needed).
The server reads its port from the `PORT` environment variable, defaulting to `8080`.

## Deploying

This repo includes a `render.yaml` [Render](https://render.com) Blueprint, set up for Render's free tier.
Connect the repo on Render and it picks up the build and start commands automatically.
