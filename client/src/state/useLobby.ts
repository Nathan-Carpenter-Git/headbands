import { useContext } from "react";
import { LobbyContext, type LobbyContextValue } from "./lobbyContext";

export function useLobby(): LobbyContextValue {
  const ctx = useContext(LobbyContext);
  if (!ctx) {
    throw new Error("useLobby must be used within a LobbyProvider");
  }
  return ctx;
}
