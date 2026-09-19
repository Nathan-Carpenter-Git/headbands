import { createContext } from "react";
import type {
  CategorySummaryDTO,
  CategoryUploadDTO,
  LobbySettingsDTO,
  LobbyStateDTO,
  RoundResultsDTO,
  RoundStateDTO,
} from "@headbands/shared";

export interface LobbyContextValue {
  connected: boolean;
  myPlayerId: string | null;
  lobby: LobbyStateDTO | null;
  round: RoundStateDTO | null;
  roundResults: RoundResultsDTO | null;
  categories: CategorySummaryDTO[];
  /** Custom categories uploaded to the current lobby session (not the player's whole local library). */
  lobbyCustomCategories: CategorySummaryDTO[];
  errorMessage: string | null;
  dismissError: () => void;
  createLobby: (playerName: string) => void;
  joinLobby: (code: string, playerName: string) => void;
  leaveLobby: () => void;
  updateSettings: (settings: Partial<LobbySettingsDTO>) => void;
  uploadCategory: (category: CategoryUploadDTO) => void;
  startRound: () => void;
  swapCard: () => void;
  revealCard: () => void;
  playAgain: () => void;
}

export const LobbyContext = createContext<LobbyContextValue | null>(null);
