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

## Card pools

Base categories are loaded when the server starts.
A few are written by hand in `server/src/baseCategories.ts`.
The rest are JSON files in `server/data/categories/`, one per category, so the pool can grow without touching code.
If a file shares an id with a hand written category, their cards are merged.

Some of those files are generated from Wikidata (CC0) by `scripts/build-wikidata-pools.mjs`, ranked by popularity so the cards are ones people will recognize.
Run it with `node scripts/build-wikidata-pools.mjs`, optionally followed by category ids.
Existing files are skipped unless you pass `--force`.

`node scripts/check-card-pools.mjs` is the quality gate.
It prints only counts, never card text, and `--fix` removes or repairs flagged cards.
Run it after adding or regenerating any pool.

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
