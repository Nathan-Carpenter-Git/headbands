import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  CATEGORY_LIMITS,
  DEFAULT_SETTINGS,
  GAME_LIMITS,
  GAME_MODES,
  SPYBANDS_RULES,
  majorityOf,
  type CategorySummaryDTO,
  type CategoryUploadDTO,
  type LobbySettingsDTO,
  type LobbyStateDTO,
  type PlacementDTO,
  type PlayerDTO,
  type RoundPlayerViewDTO,
  type RoundResultsDTO,
  type RoundStateDTO,
  type SpybandsOutcome,
  type SpybandsPlayerViewDTO,
  type SpybandsStage,
} from "@headbands/shared";
import { generateLobbyCode } from "./lobbyCodes.js";
import { getCategoryById, type Category } from "./baseCategories.js";
import { shuffle } from "./shuffle.js";

interface Player {
  id: string;
  name: string;
  isLeader: boolean;
  score: number;
  /** A secret only this player's client knows, used to reclaim their seat after a reconnect. */
  token: string;
  /** Null while they're within the reconnect grace period after a dropped connection. */
  ws: WebSocket | null;
  connected: boolean;
}

interface RoundPlayer {
  card: string;
  revealed: boolean;
  place: number | null;
  pointsAwarded: number;
}

interface HeadbandsGame {
  mode: "headbands";
  roundNumber: number;
  categoryName: string;
  /** Fixed at round start: the denominator for scoring, even if someone later disconnects. */
  roundPlayerCount: number;
  players: Map<string, RoundPlayer>;
  unusedCards: string[];
}

interface SpyPlayer {
  votedSwap: boolean;
  ready: boolean;
  accusing: string | null;
}

interface SpybandsResult {
  outcome: SpybandsOutcome;
  accusedName: string | null;
  votesReceived: Map<string, number>;
  pointsAwarded: Map<string, number>;
}

interface SpybandsGame {
  mode: "spybands";
  roundNumber: number;
  categoryName: string;
  stage: SpybandsStage;
  card: string;
  /** Every card in the category, used to refill the swap pile once it runs dry. */
  categoryCards: string[];
  /** Cards not yet shown this round, drawn from when a swap vote passes. */
  swapPile: string[];
  /** What the spy sees: the card hidden among others, rebuilt whenever the card changes. */
  candidates: string[];
  spyId: string;
  /** Kept separately so the results can still name the spy if they leave mid-round. */
  spyName: string;
  players: Map<string, SpyPlayer>;
  lockIn: { targetId: string; endsAt: number; timer: ReturnType<typeof setTimeout> } | null;
  /** Set while the spy is guessing the card; runs out as a miss. */
  guess: { endsAt: number; timer: ReturnType<typeof setTimeout> } | null;
  /** Set once the round is over. */
  result: SpybandsResult | null;
}

type Game = HeadbandsGame | SpybandsGame;

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

export interface LobbyManagerOptions {
  /** How long a Spybands majority accusation must hold before it locks in. Shortened in tests. */
  spyLockInMs?: number;
  /** How long a guessing Spybands spy has to claim they got it. Shortened in tests. */
  spyGuessMs?: number;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private readonly spyLockInMs: number;
  private readonly spyGuessMs: number;

  constructor({ spyLockInMs = SPYBANDS_RULES.lockInMs, spyGuessMs = SPYBANDS_RULES.guessMs }: LobbyManagerOptions = {}) {
    this.spyLockInMs = spyLockInMs;
    this.spyGuessMs = spyGuessMs;
  }

  getLobby(code: string): Lobby | undefined {
    return this.lobbies.get(code.toUpperCase());
  }

  createLobby(playerName: string, ws: WebSocket): { lobby: Lobby; playerId: string; token: string } {
    const name = this.validatePlayerName(playerName);
    const code = generateLobbyCode((c) => this.lobbies.has(c));
    const playerId = randomUUID();
    const token = randomUUID();
    const lobby: Lobby = {
      code,
      phase: "lobby",
      players: new Map([[playerId, { id: playerId, name, isLeader: true, score: 0, token, ws, connected: true }]]),
      settings: { ...DEFAULT_SETTINGS },
      game: null,
      customCategories: new Map(),
    };
    this.lobbies.set(code, lobby);
    return { lobby, playerId, token };
  }

  joinLobby(code: string, playerName: string, ws: WebSocket): { lobby: Lobby; playerId: string; token: string } {
    const name = this.validatePlayerName(playerName);
    const lobby = this.lobbies.get(code.toUpperCase());
    if (!lobby) {
      throw new LobbyError(`No lobby found with code ${code.toUpperCase()}`);
    }
    if (lobby.phase === "round") {
      throw new LobbyError("A round is in progress, wait for it to finish before joining");
    }
    const playerId = randomUUID();
    const token = randomUUID();
    lobby.players.set(playerId, { id: playerId, name, isLeader: false, score: 0, token, ws, connected: true });
    return { lobby, playerId, token };
  }

  /**
   * Reattaches a new connection to an existing player record after a dropped connection.
   * Also returns the connection it replaced, if the server still had one: the client can notice
   * a drop and reconnect before the server notices the old socket is dead, and the caller must
   * retire that stale socket so it can't later disconnect the player out from under the new one.
   */
  resumeSession(
    code: string,
    playerId: string,
    token: string,
    ws: WebSocket,
  ): { lobby: Lobby; replacedWs: WebSocket | null } {
    const lobby = this.lobbies.get(code.toUpperCase());
    if (!lobby) {
      throw new LobbyError("That lobby no longer exists");
    }
    const player = lobby.players.get(playerId);
    if (!player || player.token !== token) {
      throw new LobbyError("Couldn't resume that session");
    }
    const replacedWs = player.ws !== ws ? player.ws : null;
    player.ws = ws;
    player.connected = true;
    return { lobby, replacedWs };
  }

  /**
   * Marks a player as disconnected without removing them, so a reconnect within the grace
   * period (handled by the caller) can reclaim their seat, score, and place mid-round instead
   * of losing it to a brief network drop or a locked phone.
   * Only applies if `ws` is still the player's current connection, so a stale socket closing
   * after the player already resumed on a new one is ignored. Returns whether it applied.
   */
  markDisconnected(lobby: Lobby, playerId: string, ws: WebSocket): boolean {
    const player = lobby.players.get(playerId);
    if (!player || player.ws !== ws) return false;
    player.ws = null;
    player.connected = false;
    return true;
  }

  updateSettings(lobby: Lobby, playerId: string, settings: Partial<LobbySettingsDTO>): void {
    this.requireLeader(lobby, playerId);
    if (lobby.phase === "round") {
      throw new LobbyError("Can't change settings while a round is in progress");
    }
    if (settings.gameMode !== undefined) {
      if (!Object.hasOwn(GAME_MODES, settings.gameMode)) {
        throw new LobbyError("Unknown game mode");
      }
      if (lobby.game && settings.gameMode !== lobby.settings.gameMode) {
        throw new LobbyError("Can't switch game modes in the middle of a game");
      }
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
    const mode = GAME_MODES[lobby.settings.gameMode];
    if (lobby.players.size < mode.minPlayers) {
      throw new LobbyError(`${mode.label} needs at least ${mode.minPlayers} players`);
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
    if (lobby.settings.gameMode === "spybands") {
      this.startSpybandsRound(lobby, roundNumber, category);
      return;
    }

    const playerIds = shuffle([...lobby.players.keys()]);
    const { dealt, unusedCards } = this.dealCards(category.cards, playerIds.length);

    const roundPlayers = new Map<string, RoundPlayer>();
    playerIds.forEach((id, i) => {
      roundPlayers.set(id, { card: dealt[i], revealed: false, place: null, pointsAwarded: 0 });
    });

    lobby.game = {
      mode: "headbands",
      roundNumber,
      categoryName: category.name,
      roundPlayerCount: playerIds.length,
      players: roundPlayers,
      unusedCards,
    };
    lobby.phase = "round";
  }

  private startSpybandsRound(lobby: Lobby, roundNumber: number, category: Category): void {
    const [card, ...rest] = shuffle(category.cards);
    const playerIds = [...lobby.players.keys()];
    const spyId = playerIds[Math.floor(Math.random() * playerIds.length)];
    lobby.game = {
      mode: "spybands",
      roundNumber,
      categoryName: category.name,
      stage: "choosing",
      card,
      categoryCards: category.cards,
      swapPile: rest,
      candidates: spyCandidates(card, category.cards),
      spyId,
      spyName: lobby.players.get(spyId)!.name,
      players: new Map(playerIds.map((id) => [id, { votedSwap: false, ready: false, accusing: null }])),
      lockIn: null,
      guess: null,
      result: null,
    };
    lobby.phase = "round";
  }

  swapCard(lobby: Lobby, playerId: string): void {
    const { game, rp } = this.requireHeadbandsPlayer(lobby, playerId);
    if (rp.revealed) {
      throw new LobbyError("You've already revealed your card");
    }
    if (game.unusedCards.length === 0) {
      throw new LobbyError("No more cards left to swap to");
    }
    const index = Math.floor(Math.random() * game.unusedCards.length);
    const [newCard] = game.unusedCards.splice(index, 1);
    game.unusedCards.push(rp.card);
    rp.card = newCard;
  }

  revealCard(lobby: Lobby, playerId: string): void {
    const { game, rp } = this.requireHeadbandsPlayer(lobby, playerId);
    if (rp.revealed) {
      throw new LobbyError("You've already revealed your card");
    }
    this.revealPlayer(game, rp);
    this.maybeAutoRevealLast(game, lobby.settings.autoRevealLast);
    this.maybeCompleteRound(lobby, game);
  }

  /** Spybands "choosing" stage: vote for (or withdraw a vote for) a different shared card. */
  spyVoteSwap(lobby: Lobby, playerId: string, vote: boolean): void {
    const { game, sp } = this.requireSpyPlayer(lobby, playerId, "choosing");
    sp.votedSwap = vote;
    // Wanting a new card and being ready to play with this one are opposites.
    if (vote) sp.ready = false;
    this.settleChoosingStage(game);
  }

  /** Spybands "choosing" stage: accept the current card, or take that back. */
  spyReady(lobby: Lobby, playerId: string, ready: boolean): void {
    const { game, sp } = this.requireSpyPlayer(lobby, playerId, "choosing");
    sp.ready = ready;
    if (ready) sp.votedSwap = false;
    this.settleChoosingStage(game);
  }

  /** Spybands "voting" stage: accuse someone of being the spy, or withdraw the accusation. */
  spyAccuse(lobby: Lobby, playerId: string, targetId: string | null): void {
    const { game, sp } = this.requireSpyPlayer(lobby, playerId, "voting");
    if (game.guess) {
      throw new LobbyError("The spy is guessing the card");
    }
    if (targetId !== null) {
      if (targetId === playerId) {
        throw new LobbyError("You can't vote for yourself");
      }
      if (!game.players.has(targetId)) {
        throw new LobbyError("That player isn't in this round");
      }
    }
    sp.accusing = targetId;
    this.settleLockIn(lobby, game);
  }

  /**
   * Spybands "voting" stage: the spy has said a guess out loud and wants to see the card. This
   * freezes the vote, so it's only allowed before an accusation reaches a majority. The spy then
   * has a few seconds to claim they got it, or it counts as a miss.
   */
  spyStartGuess(lobby: Lobby, playerId: string): void {
    const { game } = this.requireSpyPlayer(lobby, playerId, "voting");
    if (playerId !== game.spyId) {
      throw new LobbyError("Only the spy can guess the card");
    }
    if (game.guess) {
      throw new LobbyError("You're already guessing");
    }
    if (game.lockIn) {
      throw new LobbyError("Too late, the vote is locking in");
    }
    const timer = setTimeout(() => {
      if (lobby.game !== game || game.guess?.timer !== timer) return;
      this.finishSpybandsRound(lobby, game, "spyMissed");
      this.broadcastGameState(lobby);
    }, this.spyGuessMs);
    game.guess = { endsAt: Date.now() + this.spyGuessMs, timer };
  }

  /** Spybands: the guessing spy says whether their guess matched the card. */
  spyFinishGuess(lobby: Lobby, playerId: string, correct: boolean): void {
    const { game } = this.requireSpyPlayer(lobby, playerId, "voting");
    if (playerId !== game.spyId || !game.guess) {
      throw new LobbyError("You're not guessing the card");
    }
    this.finishSpybandsRound(lobby, game, correct ? "spyGuessed" : "spyMissed");
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
      if (lobby.game?.mode === "spybands") this.cancelTimers(lobby.game);
      this.lobbies.delete(lobby.code);
      return true;
    }
    const stillHasLeader = [...lobby.players.values()].some((p) => p.isLeader);
    if (!stillHasLeader) {
      const next = lobby.players.values().next().value as Player;
      next.isLeader = true;
    }
    if (lobby.phase === "round" && lobby.game?.mode === "headbands") {
      lobby.game.players.delete(playerId);
      this.maybeAutoRevealLast(lobby.game, lobby.settings.autoRevealLast);
      this.maybeCompleteRound(lobby, lobby.game);
    }
    if (lobby.phase === "round" && lobby.game?.mode === "spybands") {
      this.removeSpyPlayer(lobby, lobby.game, playerId);
    }
    return false;
  }

  toDTO(lobby: Lobby): LobbyStateDTO {
    return {
      code: lobby.code,
      phase: lobby.phase,
      settings: lobby.settings,
      players: [...lobby.players.values()].map(
        (p): PlayerDTO => ({ id: p.id, name: p.name, isLeader: p.isLeader, score: p.score, connected: p.connected }),
      ),
    };
  }

  toRoundStateDTO(lobby: Lobby, forPlayerId: string): RoundStateDTO | null {
    if (!lobby.game) return null;
    const game = lobby.game;
    if (game.mode === "spybands") {
      const isSpy = forPlayerId === game.spyId;
      return {
        mode: "spybands",
        roundNumber: game.roundNumber,
        totalRounds: lobby.settings.rounds,
        categoryName: game.categoryName,
        stage: game.stage,
        isSpy,
        card: isSpy && !game.guess ? null : game.card,
        candidates: isSpy ? game.candidates : null,
        majority: majorityOf(game.players.size),
        players: [...game.players.entries()].map(
          ([id, sp]): SpybandsPlayerViewDTO => ({
            id,
            name: lobby.players.get(id)?.name ?? "?",
            connected: lobby.players.get(id)?.connected ?? false,
            votedSwap: sp.votedSwap,
            ready: sp.ready,
            accusing: sp.accusing,
          }),
        ),
        lockIn: game.lockIn
          ? { targetId: game.lockIn.targetId, remainingMs: Math.max(0, game.lockIn.endsAt - Date.now()) }
          : null,
        guess: game.guess ? { remainingMs: Math.max(0, game.guess.endsAt - Date.now()) } : null,
      };
    }
    return {
      mode: "headbands",
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
          connected: lobby.players.get(id)?.connected ?? false,
        }),
      ),
    };
  }

  toRoundResultsDTO(lobby: Lobby): RoundResultsDTO | null {
    if (!lobby.game) return null;
    const game = lobby.game;
    const gameOver = game.roundNumber >= lobby.settings.rounds;
    if (game.mode === "spybands") {
      if (!game.result) return null;
      const result = game.result;
      return {
        mode: "spybands",
        roundNumber: game.roundNumber,
        totalRounds: lobby.settings.rounds,
        categoryName: game.categoryName,
        gameOver,
        outcome: result.outcome,
        card: game.card,
        spyName: game.spyName,
        accusedName: result.accusedName,
        players: [...game.players.keys()]
          .map((id) => ({
            playerId: id,
            name: lobby.players.get(id)?.name ?? "?",
            isSpy: id === game.spyId,
            votesReceived: result.votesReceived.get(id) ?? 0,
            pointsAwarded: result.pointsAwarded.get(id) ?? 0,
          }))
          .sort((a, b) => Number(b.isSpy) - Number(a.isSpy) || b.votesReceived - a.votesReceived),
      };
    }
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
      mode: "headbands",
      roundNumber: game.roundNumber,
      totalRounds: lobby.settings.rounds,
      categoryName: game.categoryName,
      gameOver,
      placements,
    };
  }

  toCustomCategoriesDTO(lobby: Lobby): CategorySummaryDTO[] {
    return [...lobby.customCategories.values()].map((c) => ({ id: c.id, name: c.name, cardCount: c.cards.length }));
  }

  private sendTo(player: Player, message: unknown): void {
    if (player.ws && player.ws.readyState === player.ws.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }

  broadcast(lobby: Lobby): void {
    const lobbyDto = this.toDTO(lobby);
    for (const player of lobby.players.values()) {
      this.sendTo(player, { type: "lobbyState", lobby: lobbyDto });
    }
  }

  /** Sends the full game-state picture (lobby state, custom categories, plus round/results state as applicable) to everyone. */
  broadcastGameState(lobby: Lobby): void {
    this.broadcast(lobby);
    const customCategories = this.toCustomCategoriesDTO(lobby);
    for (const player of lobby.players.values()) {
      this.sendTo(player, { type: "customCategories", categories: customCategories });
    }
    if (lobby.phase === "round" && lobby.game) {
      for (const player of lobby.players.values()) {
        this.sendTo(player, { type: "roundState", round: this.toRoundStateDTO(lobby, player.id) });
      }
    }
    if (lobby.phase === "results" && lobby.game) {
      const results = this.toRoundResultsDTO(lobby);
      for (const player of lobby.players.values()) {
        this.sendTo(player, { type: "roundResults", results });
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

  private revealPlayer(game: HeadbandsGame, rp: RoundPlayer): void {
    const revealedCount = [...game.players.values()].filter((p) => p.revealed).length;
    rp.revealed = true;
    rp.place = revealedCount + 1;
  }

  private maybeAutoRevealLast(game: HeadbandsGame, autoRevealLast: boolean): void {
    if (!autoRevealLast) return;
    const remaining = [...game.players.values()].filter((p) => !p.revealed);
    if (remaining.length === 1) {
      this.revealPlayer(game, remaining[0]);
    }
  }

  private maybeCompleteRound(lobby: Lobby, game: HeadbandsGame): void {
    if (game.players.size === 0) return;
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

  /** Swaps the card once a majority wants a new one, and starts the vote once everyone's ready. */
  private settleChoosingStage(game: SpybandsGame): void {
    const players = [...game.players.values()];
    const majority = majorityOf(game.players.size);
    if (players.filter((p) => p.votedSwap).length >= majority) {
      if (game.swapPile.length === 0) {
        game.swapPile = shuffle(game.categoryCards.filter((c) => c !== game.card));
      }
      game.card = game.swapPile.pop()!;
      game.candidates = spyCandidates(game.card, game.categoryCards);
      // A new card needs everyone to look at it and agree again.
      for (const p of players) {
        p.votedSwap = false;
        p.ready = false;
      }
      return;
    }
    if (players.every((p) => p.ready)) {
      game.stage = "voting";
    }
  }

  /**
   * Starts the lock-in countdown when an accusation reaches a majority, and cancels it if that
   * majority falls apart before it runs out. A majority that just changes voters keeps its clock.
   */
  private settleLockIn(lobby: Lobby, game: SpybandsGame): void {
    const votes = this.tallyAccusations(game);
    const majority = majorityOf(game.players.size);
    const targetId = [...votes].find(([, count]) => count >= majority)?.[0] ?? null;
    if (game.lockIn?.targetId === targetId) return;
    this.cancelLockIn(game);
    if (targetId === null) return;
    const timer = setTimeout(() => {
      if (lobby.game !== game || game.lockIn?.targetId !== targetId) return;
      this.finishSpybandsRound(lobby, game, targetId === game.spyId ? "caught" : "escaped", targetId);
      this.broadcastGameState(lobby);
    }, this.spyLockInMs);
    game.lockIn = { targetId, endsAt: Date.now() + this.spyLockInMs, timer };
  }

  private cancelLockIn(game: SpybandsGame): void {
    if (!game.lockIn) return;
    clearTimeout(game.lockIn.timer);
    game.lockIn = null;
  }

  private cancelTimers(game: SpybandsGame): void {
    this.cancelLockIn(game);
    if (game.guess) clearTimeout(game.guess.timer);
    game.guess = null;
  }

  private tallyAccusations(game: SpybandsGame): Map<string, number> {
    const votes = new Map<string, number>();
    for (const p of game.players.values()) {
      if (p.accusing !== null) votes.set(p.accusing, (votes.get(p.accusing) ?? 0) + 1);
    }
    return votes;
  }

  private finishSpybandsRound(
    lobby: Lobby,
    game: SpybandsGame,
    outcome: SpybandsOutcome,
    accusedId: string | null = null,
  ): void {
    this.cancelTimers(game);
    const pointsAwarded = new Map<string, number>();
    for (const id of game.players.keys()) {
      const isSpy = id === game.spyId;
      let points = 0;
      if ((outcome === "caught" || outcome === "spyMissed") && !isSpy) points = SPYBANDS_RULES.pointsForCatchingSpy;
      if (outcome === "escaped" && isSpy) points = SPYBANDS_RULES.pointsForSpyEscaping;
      if (outcome === "spyGuessed" && isSpy) points = SPYBANDS_RULES.pointsForSpyGuessing;
      pointsAwarded.set(id, points);
      const player = lobby.players.get(id);
      if (player) player.score += points;
    }
    game.result = {
      outcome,
      accusedName: accusedId ? (lobby.players.get(accusedId)?.name ?? "?") : null,
      votesReceived: this.tallyAccusations(game),
      pointsAwarded,
    };
    lobby.phase = "results";
  }

  /** A player left for good mid-round: call the round off if it can't go on, else drop their votes. */
  private removeSpyPlayer(lobby: Lobby, game: SpybandsGame, playerId: string): void {
    game.players.delete(playerId);
    if (playerId === game.spyId) {
      this.finishSpybandsRound(lobby, game, "spyLeft");
      return;
    }
    if (game.players.size < GAME_MODES.spybands.minPlayers) {
      this.finishSpybandsRound(lobby, game, "tooFewPlayers");
      return;
    }
    for (const p of game.players.values()) {
      if (p.accusing === playerId) p.accusing = null;
    }
    // The majority just shrank, so a pending swap, ready check, or accusation may now pass.
    if (game.stage === "choosing") {
      this.settleChoosingStage(game);
    } else if (!game.guess) {
      this.settleLockIn(lobby, game);
    }
  }

  private requireHeadbandsPlayer(lobby: Lobby, playerId: string): { game: HeadbandsGame; rp: RoundPlayer } {
    const game = lobby.game;
    if (lobby.phase !== "round" || game?.mode !== "headbands") {
      throw new LobbyError("No round is in progress");
    }
    const rp = game.players.get(playerId);
    if (!rp) {
      throw new LobbyError("You're not part of the current round");
    }
    return { game, rp };
  }

  private requireSpyPlayer(
    lobby: Lobby,
    playerId: string,
    stage: SpybandsStage,
  ): { game: SpybandsGame; sp: SpyPlayer } {
    const game = lobby.game;
    if (lobby.phase !== "round" || game?.mode !== "spybands") {
      throw new LobbyError("No round is in progress");
    }
    const sp = game.players.get(playerId);
    if (!sp) {
      throw new LobbyError("You're not part of the current round");
    }
    if (game.stage !== stage) {
      throw new LobbyError(stage === "choosing" ? "The card is already locked in" : "Voting hasn't started yet");
    }
    return { game, sp };
  }

  private requireLeader(lobby: Lobby, playerId: string): void {
    const player = lobby.players.get(playerId);
    if (!player?.isLeader) {
      throw new LobbyError("Only the party leader can do that");
    }
  }
}

/** The card plus as many other cards from the category as fit in the spy's shortlist, shuffled. */
function spyCandidates(card: string, categoryCards: string[]): string[] {
  const others = shuffle([...new Set(categoryCards)].filter((c) => c !== card));
  return shuffle([card, ...others.slice(0, SPYBANDS_RULES.spyCandidates - 1)]);
}
