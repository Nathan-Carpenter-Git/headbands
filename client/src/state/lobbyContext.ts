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
  spyVoteSwap: (vote: boolean) => void;
  spyReady: (ready: boolean) => void;
  /** Accuse a player of being the spy, or pass null to withdraw the accusation. */
  spyAccuse: (targetId: string | null) => void;
  /** As the spy, after saying a guess out loud: see the card and freeze the vote. */
  spyStartGuess: () => void;
  /** As the guessing spy: say whether the guess matched the card. */
  spyFinishGuess: (correct: boolean) => void;
  playAgain: () => void;
}

export const LobbyContext = createContext<LobbyContextValue | null>(null);
