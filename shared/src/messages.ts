import type {
  CategorySummaryDTO,
  CategoryUploadDTO,
  LobbySettingsDTO,
  LobbyStateDTO,
  RoundResultsDTO,
  RoundStateDTO,
} from "./types.js";

export type ClientMessage =
  | { type: "createLobby"; playerName: string }
  | { type: "joinLobby"; code: string; playerName: string }
  | { type: "leaveLobby" }
  | { type: "updateSettings"; settings: Partial<LobbySettingsDTO> }
  | { type: "uploadCategory"; category: CategoryUploadDTO }
  | { type: "startRound" }
  | { type: "swapCard" }
  | { type: "revealCard" }
  | { type: "playAgain" };

export type ServerMessage =
  | { type: "joined"; playerId: string; lobby: LobbyStateDTO }
  | { type: "lobbyState"; lobby: LobbyStateDTO }
  | { type: "categories"; categories: CategorySummaryDTO[] }
  | { type: "customCategories"; categories: CategorySummaryDTO[] }
  | { type: "roundState"; round: RoundStateDTO }
  | { type: "roundResults"; results: RoundResultsDTO }
  | { type: "error"; message: string };
