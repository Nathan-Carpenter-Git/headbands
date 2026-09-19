import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  CATEGORY_LIMITS,
  DEFAULT_SETTINGS,
  GAME_LIMITS,
  type CategorySummaryDTO,
  type CategoryUploadDTO,
  type LobbySettingsDTO,
  type LobbyStateDTO,
  type PlacementDTO,
  type PlayerDTO,
  type RoundPlayerViewDTO,
  type RoundResultsDTO,
  type RoundStateDTO,
} from "@headbands/shared";
import { generateLobbyCode } from "./lobbyCodes.js";
import { getCategoryById, type Category } from "./baseCategories.js";
import { shuffle } from "./shuffle.js";

interface Player {
  id: string;
  name: string;
  isLeader: boolean;
  score: number;
  ws: WebSocket;
}

interface RoundPlayer {
  card: string;
  revealed: boolean;
  place: number | null;
  pointsAwarded: number;
}

interface Game {
  roundNumber: number;
  categoryName: string;
  /** Fixed at round start: the denominator for scoring, even if someone later disconnects. */
  roundPlayerCount: number;
  players: Map<string, RoundPlayer>;
  unusedCards: string[];
}

export interface Lobby {
  code: string;
  phase: LobbyStateDTO["phase"];
  players: Map<string, Player>;
  settings: LobbySettingsDTO;
  game: Game | null;
  /** Categories uploaded by players in this lobby session (not persisted anywhere server-side). */
  customCategories: Map<string, Category>;
}

export class LobbyError extends Error {}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();

  getLobby(code: string): Lobby | undefined {
    return this.lobbies.get(code.toUpperCase());
  }

  createLobby(playerName: string, ws: WebSocket): { lobby: Lobby; playerId: string } {
    const name = this.validatePlayerName(playerName);
    const code = generateLobbyCode((c) => this.lobbies.has(c));
    const playerId = randomUUID();
    const lobby: Lobby = {
      code,
      phase: "lobby",
      players: new Map([[playerId, { id: playerId, name, isLeader: true, score: 0, ws }]]),
      settings: { ...DEFAULT_SETTINGS },
      game: null,
      customCategories: new Map(),
    };
    this.lobbies.set(code, lobby);
    return { lobby, playerId };
  }

  joinLobby(code: string, playerName: string, ws: WebSocket): { lobby: Lobby; playerId: string } {
    const name = this.validatePlayerName(playerName);
    const lobby = this.lobbies.get(code.toUpperCase());
    if (!lobby) {
      throw new LobbyError(`No lobby found with code ${code.toUpperCase()}`);
    }
    if (lobby.phase === "round") {
      throw new LobbyError("A round is in progress, wait for it to finish before joining");
    }
    const playerId = randomUUID();
    lobby.players.set(playerId, { id: playerId, name, isLeader: false, score: 0, ws });
    return { lobby, playerId };
  }

  updateSettings(lobby: Lobby, playerId: string, settings: Partial<LobbySettingsDTO>): void {
    this.requireLeader(lobby, playerId);
    if (lobby.phase === "round") {
      throw new LobbyError("Can't change settings while a round is in progress");
    }
    if (settings.rounds !== undefined) {
      if (
        !Number.isInteger(settings.rounds) ||
        settings.rounds < GAME_LIMITS.minRounds ||
        settings.rounds > GAME_LIMITS.maxRounds
      ) {
        throw new LobbyError(`Rounds must be between ${GAME_LIMITS.minRounds} and ${GAME_LIMITS.maxRounds}`);
      }
    }
    lobby.settings = { ...lobby.settings, ...settings };
  }

  uploadCategory(lobby: Lobby, playerId: string, category: CategoryUploadDTO): void {
    this.requireLeader(lobby, playerId);
    if (lobby.phase === "round") {
      throw new LobbyError("Can't add categories while a round is in progress");
    }
    lobby.customCategories.set(category.id, this.validateCategory(category));
  }

  startRound(lobby: Lobby, playerId: string): void {
    this.requireLeader(lobby, playerId);
    if (lobby.phase === "round") {
      throw new LobbyError("A round is already in progress");
    }
    if (lobby.players.size < 2) {
      throw new LobbyError("Need at least 2 players to start");
    }
    if (lobby.settings.categoryIds.length === 0) {
      throw new LobbyError("Pick at least one category before starting");
    }
    const roundNumber = (lobby.game?.roundNumber ?? 0) + 1;
    if (roundNumber > lobby.settings.rounds) {
      throw new LobbyError("This game is already over, start a new game instead");
    }

    const categoryId = this.pickCategoryForRound(lobby.settings, roundNumber);
    const category = this.resolveCategory(lobby, categoryId);
    if (!category) {
      throw new LobbyError("Selected category no longer exists");
    }
    const playerIds = shuffle([...lobby.players.keys()]);
    const { dealt, unusedCards } = this.dealCards(category.cards, playerIds.length);

    const roundPlayers = new Map<string, RoundPlayer>();
    playerIds.forEach((id, i) => {
      roundPlayers.set(id, { card: dealt[i], revealed: false, place: null, pointsAwarded: 0 });
    });

    lobby.game = {
      roundNumber,
      categoryName: category.name,
      roundPlayerCount: playerIds.length,
      players: roundPlayers,
      unusedCards,
    };
    lobby.phase = "round";
  }

  swapCard(lobby: Lobby, playerId: string): void {
    const rp = this.requireRoundPlayer(lobby, playerId);
    if (rp.revealed) {
      throw new LobbyError("You've already revealed your card");
    }
    const game = lobby.game!;
    if (game.unusedCards.length === 0) {
      throw new LobbyError("No more cards left to swap to");
    }
    const index = Math.floor(Math.random() * game.unusedCards.length);
    const [newCard] = game.unusedCards.splice(index, 1);
    game.unusedCards.push(rp.card);
    rp.card = newCard;
  }

  revealCard(lobby: Lobby, playerId: string): void {
    const rp = this.requireRoundPlayer(lobby, playerId);
    if (rp.revealed) {
      throw new LobbyError("You've already revealed your card");
    }
    this.revealPlayer(lobby.game!, rp);
    this.maybeAutoRevealLast(lobby.game!, lobby.settings.autoRevealLast);
    this.maybeCompleteRound(lobby);
  }

  playAgain(lobby: Lobby, playerId: string): void {
    this.requireLeader(lobby, playerId);
    if (lobby.phase === "round") {
      throw new LobbyError("Finish the current round first");
    }
    lobby.phase = "lobby";
    lobby.game = null;
    for (const player of lobby.players.values()) {
      player.score = 0;
    }
  }

  /** Removes the player from the lobby, and from any in-progress round. Returns true if the lobby was deleted. */
  removePlayer(lobby: Lobby, playerId: string): boolean {
    lobby.players.delete(playerId);
    if (lobby.players.size === 0) {
      this.lobbies.delete(lobby.code);
      return true;
    }
    const stillHasLeader = [...lobby.players.values()].some((p) => p.isLeader);
    if (!stillHasLeader) {
      const next = lobby.players.values().next().value as Player;
      next.isLeader = true;
    }
    if (lobby.phase === "round" && lobby.game) {
      lobby.game.players.delete(playerId);
      this.maybeAutoRevealLast(lobby.game, lobby.settings.autoRevealLast);
      this.maybeCompleteRound(lobby);
    }
    return false;
  }

  toDTO(lobby: Lobby): LobbyStateDTO {
    return {
      code: lobby.code,
      phase: lobby.phase,
      settings: lobby.settings,
      players: [...lobby.players.values()].map(
        (p): PlayerDTO => ({ id: p.id, name: p.name, isLeader: p.isLeader, score: p.score }),
      ),
    };
  }

  toRoundStateDTO(lobby: Lobby, forPlayerId: string): RoundStateDTO | null {
    if (!lobby.game) return null;
    const game = lobby.game;
    return {
      roundNumber: game.roundNumber,
      totalRounds: lobby.settings.rounds,
      categoryName: game.categoryName,
      players: [...game.players.entries()].map(
        ([id, rp]): RoundPlayerViewDTO => ({
          id,
          name: lobby.players.get(id)?.name ?? "?",
          revealed: rp.revealed,
          place: rp.place,
          card: id === forPlayerId && !rp.revealed ? null : rp.card,
        }),
      ),
    };
  }

  toRoundResultsDTO(lobby: Lobby): RoundResultsDTO | null {
    if (!lobby.game) return null;
    const game = lobby.game;
    const placements: PlacementDTO[] = [...game.players.entries()]
      .map(([id, rp]): PlacementDTO => ({
        playerId: id,
        name: lobby.players.get(id)?.name ?? "?",
        place: rp.place ?? game.roundPlayerCount,
        pointsAwarded: rp.pointsAwarded,
        card: rp.card,
      }))
      .sort((a, b) => a.place - b.place);
    return {
      roundNumber: game.roundNumber,
      totalRounds: lobby.settings.rounds,
      categoryName: game.categoryName,
      gameOver: game.roundNumber >= lobby.settings.rounds,
      placements,
    };
  }

  toCustomCategoriesDTO(lobby: Lobby): CategorySummaryDTO[] {
    return [...lobby.customCategories.values()].map((c) => ({ id: c.id, name: c.name, cardCount: c.cards.length }));
  }

  broadcast(lobby: Lobby): void {
    const dto = this.toDTO(lobby);
    const payload = JSON.stringify({ type: "lobbyState", lobby: dto });
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === player.ws.OPEN) {
        player.ws.send(payload);
      }
    }
  }

  /** Sends the full game-state picture (lobby state, custom categories, plus round/results state as applicable) to everyone. */
  broadcastGameState(lobby: Lobby): void {
    this.broadcast(lobby);
    const customCategoriesPayload = JSON.stringify({
      type: "customCategories",
      categories: this.toCustomCategoriesDTO(lobby),
    });
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === player.ws.OPEN) {
        player.ws.send(customCategoriesPayload);
      }
    }
    if (lobby.phase === "round" && lobby.game) {
      for (const player of lobby.players.values()) {
        if (player.ws.readyState !== player.ws.OPEN) continue;
        const round = this.toRoundStateDTO(lobby, player.id);
        player.ws.send(JSON.stringify({ type: "roundState", round }));
      }
    }
    if (lobby.phase === "results" && lobby.game) {
      const results = this.toRoundResultsDTO(lobby);
      const payload = JSON.stringify({ type: "roundResults", results });
      for (const player of lobby.players.values()) {
        if (player.ws.readyState === player.ws.OPEN) {
          player.ws.send(payload);
        }
      }
    }
  }

  private resolveCategory(lobby: Lobby, id: string): Category | undefined {
    return lobby.customCategories.get(id) ?? getCategoryById(id);
  }

  private validateCategory(category: CategoryUploadDTO): Category {
    const name = category.name?.trim();
    if (!name || name.length > CATEGORY_LIMITS.maxNameLength) {
      throw new LobbyError(`Category name must be 1-${CATEGORY_LIMITS.maxNameLength} characters`);
    }
    if (!category.id || typeof category.id !== "string") {
      throw new LobbyError("Category is missing an id");
    }
    const cards = [...new Set((category.cards ?? []).map((c) => c.trim()).filter(Boolean))];
    if (cards.length < CATEGORY_LIMITS.minCards) {
      throw new LobbyError(`"${name}" needs at least ${CATEGORY_LIMITS.minCards} cards`);
    }
    if (cards.length > CATEGORY_LIMITS.maxCards) {
      throw new LobbyError(`"${name}" has too many cards (max ${CATEGORY_LIMITS.maxCards})`);
    }
    if (cards.some((c) => c.length > CATEGORY_LIMITS.maxCardLength)) {
      throw new LobbyError(`Cards in "${name}" must be ${CATEGORY_LIMITS.maxCardLength} characters or fewer`);
    }
    return { id: category.id, name, cards };
  }

  private validatePlayerName(name: string): string {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new LobbyError("Name can't be empty");
    }
    if (trimmed.length > GAME_LIMITS.maxPlayerNameLength) {
      throw new LobbyError(`Name must be ${GAME_LIMITS.maxPlayerNameLength} characters or fewer`);
    }
    return trimmed;
  }

  /**
   * Deals `count` cards from `cards`, one per player. If there are enough unique cards, everyone
   * gets a distinct one and the leftovers become the swap pool. If there aren't enough, duplicates
   * are unavoidable, so they're spread as evenly as possible (e.g. 10 cards / 11 players means
   * exactly one card is dealt twice, not more) by cycling through fresh shuffles of the full set.
   * With duplicates in play, every card is already "in use", so there's no separate swap pool.
   */
  private dealCards(cards: string[], count: number): { dealt: string[]; unusedCards: string[] } {
    if (cards.length >= count) {
      const dealt = shuffle(cards).slice(0, count);
      const dealtSet = new Set(dealt);
      const unusedCards = cards.filter((c) => !dealtSet.has(c));
      return { dealt, unusedCards };
    }
    const dealt: string[] = [];
    while (dealt.length < count) {
      const remaining = count - dealt.length;
      dealt.push(...shuffle(cards).slice(0, Math.min(remaining, cards.length)));
    }
    return { dealt, unusedCards: [] };
  }

  private pickCategoryForRound(settings: LobbySettingsDTO, roundNumber: number): string {
    const ids = settings.categoryIds;
    if (settings.randomizeOrder) {
      return ids[Math.floor(Math.random() * ids.length)];
    }
    return ids[(roundNumber - 1) % ids.length];
  }

  private revealPlayer(game: Game, rp: RoundPlayer): void {
    const revealedCount = [...game.players.values()].filter((p) => p.revealed).length;
    rp.revealed = true;
    rp.place = revealedCount + 1;
  }

  private maybeAutoRevealLast(game: Game, autoRevealLast: boolean): void {
    if (!autoRevealLast) return;
    const remaining = [...game.players.values()].filter((p) => !p.revealed);
    if (remaining.length === 1) {
      this.revealPlayer(game, remaining[0]);
    }
  }

  private maybeCompleteRound(lobby: Lobby): void {
    const game = lobby.game;
    if (!game || game.players.size === 0) return;
    const allRevealed = [...game.players.values()].every((p) => p.revealed);
    if (!allRevealed) return;
    for (const [pid, rp] of game.players) {
      const score = this.scoreForPlace(rp.place!, game.roundPlayerCount);
      rp.pointsAwarded = score;
      const player = lobby.players.get(pid);
      if (player) player.score += score;
    }
    lobby.phase = "results";
  }

  private scoreForPlace(place: number, roundPlayerCount: number): number {
    if (place >= roundPlayerCount) return 0;
    return roundPlayerCount - place + 1;
  }

  private requireRoundPlayer(lobby: Lobby, playerId: string): RoundPlayer {
    if (lobby.phase !== "round" || !lobby.game) {
      throw new LobbyError("No round is in progress");
    }
    const rp = lobby.game.players.get(playerId);
    if (!rp) {
      throw new LobbyError("You're not part of the current round");
    }
    return rp;
  }

  private requireLeader(lobby: Lobby, playerId: string): void {
    const player = lobby.players.get(playerId);
    if (!player?.isLeader) {
      throw new LobbyError("Only the party leader can do that");
    }
  }
}
