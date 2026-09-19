# Headbands

An online, browser based version of the classic "guess the card on your own forehead" party game.
Players join a lobby via an invite link, get a card assigned to their "forehead" that only other players can see, and ask yes/no style questions out loud to guess what it is.
Voice communication happens outside the app, in a third party tool like Discord.
The app only needs to handle game state, not audio or video.

## Tech stack

- Frontend: React
- Backend: Node.js
- Realtime sync: WebSockets (for lobby state, card reveals, scoring, and round transitions)

There is no database and no accounts.
Lobby state lives in server memory only and is gone once the lobby empties out.
Custom categories are stored client-side, in the browser's local storage, so a player never needs to sign up to save or reuse their own categories.

## Core concepts

### Lobby

- A lobby is created by a "party leader" and identified by a short join code and a shareable invite link.
- Anyone with the link can join the lobby as a player.
- The party leader configures game settings before starting: category or category playlist, number of rounds, and the auto reveal behavior described below.
- Only the party leader can start the game.

### Categories and cards

- A category is a named set of text only cards (no images, no content filtering needed).
- The app ships with a set of base categories covering a mix of everyday topics (animals, movies, occupations, sports, food, fictional characters, and more).
- Players can build their own categories in a personal category library, stored in their browser's local storage, no account needed.
- That library supports exporting a category to a JSON file and importing one from a file, so players can share categories with each other by passing the file around.
- A future goal (not in initial scope) is a more automatic import flow, such as a shareable category code or link, instead of a manual file.
- When a lobby leader selects one of their own local categories for a lobby, the full category (name and cards) is sent to that lobby's server session so the game can deal from it.
  Custom categories are scoped to the lobby session they were added to, not saved anywhere server-side.
- The party leader can either pick a single category for the whole game or build a playlist of multiple categories.
- When a playlist is used, the leader can choose to randomize the order.

### Round flow

- At the start of a round, every player is assigned a card from the active category.
- A player can see every other player's card except their own.
- At any point before they reveal, a player may swap their own card for a new random one from the category, and can do this as many times as they want.
  This exists so a player's hesitation to swap doesn't leak information about what their card is, since infinite swaps are always available.
- Players ask each other yes/no questions out loud (via external voice chat) to figure out their own card.
- When a player figures out their card, they reveal it themselves in the app.
- Revealing locks in that player's place for the round (1st, 2nd, 3rd, and so on) in the order players revealed.
- In settings, the leader chooses whether the last remaining player is auto revealed once everyone else has revealed, or whether that player must keep guessing and reveal manually.

### Scoring

- Points for a round are based on reveal order: with N players, the player who reveals first gets N points, second gets N minus 1, and so on down to the last player, who gets 0.
- Example: in a 5 player game, 1st place gets 5 points, 2nd gets 4, 3rd gets 3, 4th gets 2, and last gets 0.
- After a round ends, the game returns to the lobby screen, which shows each player's running point total.
- From the lobby screen, the leader picks (or advances to) the next category and starts the next round.
- The game ends after the configured number of rounds, at which point final standings are shown.

## Settings summary (owned by the party leader)

- Category, or a playlist of categories with optional randomized order.
- Number of rounds.
- Whether the last player to finish is auto revealed or must reveal manually.

## Explicit non-goals for now

- No images on cards, text only.
- No content filtering or moderation of custom category text.
- No built in voice or video chat, players are expected to use an external tool.
- No fully automatic import of another user's categories yet (file-based export/import exists; a shareable code or link is a future enhancement).
