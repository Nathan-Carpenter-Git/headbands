export type LobbyPhase = "lobby" | "round" | "results";

export interface PlayerDTO {
  id: string;
  name: string;
  isLeader: boolean;
  score: number;
}

export interface CategorySummaryDTO {
  id: string;
  name: string;
  cardCount: number;
}

/** A category with its full card list, as uploaded from a player's local library. */
export interface CategoryUploadDTO {
  id: string;
  name: string;
  cards: string[];
}

export interface LobbySettingsDTO {
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
}

export interface RoundStateDTO {
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

export interface RoundResultsDTO {
  roundNumber: number;
  totalRounds: number;
  categoryName: string;
  gameOver: boolean;
  placements: PlacementDTO[];
}
