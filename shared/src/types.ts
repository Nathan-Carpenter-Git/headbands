import type { GameMode } from "./gameModes.js";

export type LobbyPhase = "lobby" | "round" | "results";

export interface PlayerDTO {
  id: string;
  name: string;
  isLeader: boolean;
  score: number;
  /** False while they're within the reconnect grace period after a dropped connection. */
  connected: boolean;
}

/** Ties together the parts a big base category was dealt into ("Cartoon Characters #1", "#2", ...). */
export interface CategoryGroupDTO {
  id: string;
  /** The name without the part suffix, e.g. "Cartoon Characters". */
  name: string;
  /** 1-based. */
  part: number;
  parts: number;
}

export interface CategorySummaryDTO {
  id: string;
  name: string;
  cardCount: number;
  /** Base categories only: the picker section it's listed under, e.g. "Characters". */
  section?: string;
  /** Base categories only: set when this is one part of a category that was split up. */
  group?: CategoryGroupDTO;
}

/** A category with its full card list, as uploaded from a player's local library. */
export interface CategoryUploadDTO {
  id: string;
  name: string;
  cards: string[];
}

export interface LobbySettingsDTO {
  gameMode: GameMode;
  categoryIds: string[];
  randomizeOrder: boolean;
  rounds: number;
  autoRevealLast: boolean;
}

export interface LobbyStateDTO {
  code: string;
  phase: LobbyPhase;
  players: PlayerDTO[];
  settings: LobbySettingsDTO;
}

export const DEFAULT_SETTINGS: LobbySettingsDTO = {
  gameMode: "headbands",
  categoryIds: [],
  randomizeOrder: false,
  rounds: 3,
  autoRevealLast: true,
};

export interface RoundPlayerViewDTO {
  id: string;
  name: string;
  revealed: boolean;
  place: number | null;
  /** Null only for the viewer's own entry while they haven't revealed yet. */
  card: string | null;
  /** False while they're within the reconnect grace period after a dropped connection. */
  connected: boolean;
}

export interface HeadbandsRoundStateDTO {
  mode: "headbands";
  roundNumber: number;
  totalRounds: number;
  categoryName: string;
  players: RoundPlayerViewDTO[];
}

export interface PlacementDTO {
  playerId: string;
  name: string;
  place: number;
  pointsAwarded: number;
  card: string;
}

export interface HeadbandsRoundResultsDTO {
  mode: "headbands";
  roundNumber: number;
  totalRounds: number;
  categoryName: string;
  gameOver: boolean;
  placements: PlacementDTO[];
}

/**
 * A Spybands round runs in two stages. In "choosing", everyone but the spy sees the shared card,
 * a majority can vote to swap it for a new one, and the round moves on once everyone readies up.
 * In "voting", players accuse someone of being the spy, and the spy may instead try one guess at
 * the card, which freezes the vote while they settle it.
 */
export type SpybandsStage = "choosing" | "voting";

export interface SpybandsPlayerViewDTO {
  id: string;
  name: string;
  connected: boolean;
  /** "choosing" stage: this player wants a different card. */
  votedSwap: boolean;
  /** "choosing" stage: this player is happy with the card and ready to play. */
  ready: boolean;
  /** "voting" stage: who this player is accusing of being the spy, if anyone. */
  accusing: string | null;
}

export interface SpybandsRoundStateDTO {
  mode: "spybands";
  roundNumber: number;
  totalRounds: number;
  categoryName: string;
  stage: SpybandsStage;
  /** Whether the viewer is the spy. Nobody learns who the spy is until the round ends. */
  isSpy: boolean;
  /** The shared card, or null when the viewer is the spy and isn't guessing it yet. */
  card: string | null;
  /**
   * The spy's shortlist: the card plus up to 19 others from the category, shuffled, so the spy
   * knows it's one of these. Null for everyone else.
   */
  candidates: string[] | null;
  /** Votes needed to swap the card, and to lock in an accusation: more than half the players. */
  majority: number;
  players: SpybandsPlayerViewDTO[];
  /** Set while an accusation holds a majority and is counting down to lock in. */
  lockIn: { targetId: string; remainingMs: number } | null;
  /**
   * Set while the spy is guessing the card: they've said a guess out loud, now see the card, and
   * must claim they got it before the time runs out, or it counts as a miss. Voting is frozen.
   */
  guess: { remainingMs: number } | null;
}

export type RoundStateDTO = HeadbandsRoundStateDTO | SpybandsRoundStateDTO;

/**
 * "caught" and "escaped" end the vote, "spyGuessed" and "spyMissed" end the spy's guess at the card.
 * "spyLeft" and "tooFewPlayers" mean the round was called off because the spy, or enough players,
 * dropped out for good, so nobody scores.
 */
export type SpybandsOutcome = "caught" | "escaped" | "spyGuessed" | "spyMissed" | "spyLeft" | "tooFewPlayers";

export interface SpybandsResultPlayerDTO {
  playerId: string;
  name: string;
  isSpy: boolean;
  /** How many players accused this player when the vote locked in. */
  votesReceived: number;
  pointsAwarded: number;
}

export interface SpybandsRoundResultsDTO {
  mode: "spybands";
  roundNumber: number;
  totalRounds: number;
  categoryName: string;
  gameOver: boolean;
  outcome: SpybandsOutcome;
  card: string;
  spyName: string;
  /** Who the vote locked in on. Null when the spy guessed or the round was called off. */
  accusedName: string | null;
  players: SpybandsResultPlayerDTO[];
}

export type RoundResultsDTO = HeadbandsRoundResultsDTO | SpybandsRoundResultsDTO;
