import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CategorySummaryDTO,
  CategoryUploadDTO,
  ClientMessage,
  LobbySettingsDTO,
  LobbyStateDTO,
  RoundResultsDTO,
  RoundStateDTO,
  ServerMessage,
} from "@headbands/shared";
import { LobbyContext } from "./lobbyContext";

const RECONNECT_DELAY_MS = 2000;

function defaultWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const WS_URL = import.meta.env.VITE_WS_URL || defaultWsUrl();

export function LobbyProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyStateDTO | null>(null);
  const [round, setRound] = useState<RoundStateDTO | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResultsDTO | null>(null);
  const [categories, setCategories] = useState<CategorySummaryDTO[]>([]);
  const [lobbyCustomCategories, setLobbyCustomCategories] = useState<CategorySummaryDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let shouldReconnect = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected(true);
        // A fresh socket (first load, or after a drop) has no server-side lobby membership.
        // Clear any stale local state so the UI falls back to "join lobby" instead of pretending
        // we're still in a game the server no longer knows about.
        setMyPlayerId(null);
        setLobby(null);
        setRound(null);
        setRoundResults(null);
        setLobbyCustomCategories([]);
      });

      ws.addEventListener("close", () => {
        setConnected(false);
        if (shouldReconnect) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });

      ws.addEventListener("message", (event) => {
        const message: ServerMessage = JSON.parse(event.data);
        switch (message.type) {
          case "joined":
            setMyPlayerId(message.playerId);
            setLobby(message.lobby);
            return;
          case "lobbyState":
            setLobby(message.lobby);
            if (message.lobby.phase === "lobby") {
              setRound(null);
              setRoundResults(null);
            }
            return;
          case "categories":
            setCategories(message.categories);
            return;
          case "customCategories":
            setLobbyCustomCategories(message.categories);
            return;
          case "roundState":
            setRound(message.round);
            return;
          case "roundResults":
            setRoundResults(message.results);
            return;
          case "error":
            setErrorMessage(message.message);
            return;
        }
      });
    }

    connect();

    return () => {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const createLobby = useCallback((playerName: string) => send({ type: "createLobby", playerName }), [send]);
  const joinLobby = useCallback(
    (code: string, playerName: string) => send({ type: "joinLobby", code, playerName }),
    [send],
  );
  const leaveLobby = useCallback(() => {
    send({ type: "leaveLobby" });
    setMyPlayerId(null);
    setLobby(null);
    setRound(null);
    setRoundResults(null);
    setLobbyCustomCategories([]);
  }, [send]);
  const updateSettings = useCallback(
    (settings: Partial<LobbySettingsDTO>) => send({ type: "updateSettings", settings }),
    [send],
  );
  const uploadCategory = useCallback(
    (category: CategoryUploadDTO) => send({ type: "uploadCategory", category }),
    [send],
  );
  const startRound = useCallback(() => send({ type: "startRound" }), [send]);
  const swapCard = useCallback(() => send({ type: "swapCard" }), [send]);
  const revealCard = useCallback(() => send({ type: "revealCard" }), [send]);
  const playAgain = useCallback(() => send({ type: "playAgain" }), [send]);
  const dismissError = useCallback(() => setErrorMessage(null), []);

  return (
    <LobbyContext.Provider
      value={{
        connected,
        myPlayerId,
        lobby,
        round,
        roundResults,
        categories,
        lobbyCustomCategories,
        errorMessage,
        dismissError,
        createLobby,
        joinLobby,
        leaveLobby,
        updateSettings,
        uploadCategory,
        startRound,
        swapCard,
        revealCard,
        playAgain,
      }}
    >
      {children}
    </LobbyContext.Provider>
  );
}
