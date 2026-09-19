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
import { playGameOver, playJoin, playReveal, playRoundComplete, playRoundStart } from "../lib/sound";
import { clearSession, loadSession, saveSession } from "../lib/session";

const RECONNECT_DELAY_MS = 2000;

function defaultWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const WS_URL = import.meta.env.VITE_WS_URL || defaultWsUrl();

export function LobbyProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  // Tracked outside React state purely to detect transitions (someone joined, a round just
  // started, my own card just got revealed) for sound cues, without re-running effects on
  // every render or reaching for a stale closure over state.
  const myPlayerIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<LobbyStateDTO["phase"] | null>(null);
  const prevPlayerCountRef = useRef(0);
  const myPrevRevealedRef = useRef(false);
  // True while a resumeSession request is in flight, so a resulting "error" reply is understood
  // as "couldn't resume" (fall back to the join screen quietly) rather than shown as a banner.
  const awaitingResumeRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyStateDTO | null>(null);
  const [round, setRound] = useState<RoundStateDTO | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResultsDTO | null>(null);
  const [categories, setCategories] = useState<CategorySummaryDTO[]>([]);
  const [lobbyCustomCategories, setLobbyCustomCategories] = useState<CategorySummaryDTO[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetLocalState = useCallback(() => {
    myPlayerIdRef.current = null;
    prevPhaseRef.current = null;
    prevPlayerCountRef.current = 0;
    myPrevRevealedRef.current = false;
    setMyPlayerId(null);
    setLobby(null);
    setRound(null);
    setRoundResults(null);
    setLobbyCustomCategories([]);
  }, []);

  useEffect(() => {
    let shouldReconnect = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected(true);
        // A fresh socket (first load, or after a drop) has no server-side lobby membership yet.
        // If we were previously in a lobby (e.g. the tab was backgrounded or the phone locked),
        // try to reclaim that seat instead of dumping the player back on the join screen. Keep
        // showing whatever was on screen until we know whether that succeeded - for a brief drop
        // it usually does, and there's no need to flash to "join lobby" and back.
        const saved = loadSession();
        if (saved) {
          awaitingResumeRef.current = true;
          ws.send(JSON.stringify({ type: "resumeSession", ...saved } satisfies ClientMessage));
        } else {
          resetLocalState();
        }
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
            saveSession({ code: message.lobby.code, playerId: message.playerId, token: message.token });
            myPlayerIdRef.current = message.playerId;
            prevPhaseRef.current = message.lobby.phase;
            prevPlayerCountRef.current = message.lobby.players.length;
            setMyPlayerId(message.playerId);
            setLobby(message.lobby);
            return;
          case "resumed": {
            awaitingResumeRef.current = false;
            const mine = message.round?.players.find((p) => p.id === message.playerId);
            myPlayerIdRef.current = message.playerId;
            prevPhaseRef.current = message.lobby.phase;
            prevPlayerCountRef.current = message.lobby.players.length;
            myPrevRevealedRef.current = mine?.revealed ?? false;
            setMyPlayerId(message.playerId);
            setLobby(message.lobby);
            setRound(message.round);
            setRoundResults(message.results);
            return;
          }
          case "lobbyState": {
            const prevPhase = prevPhaseRef.current;
            if (
              prevPhase === "lobby" &&
              message.lobby.phase === "lobby" &&
              message.lobby.players.length > prevPlayerCountRef.current
            ) {
              playJoin();
            }
            if (prevPhase !== null && prevPhase !== "round" && message.lobby.phase === "round") {
              playRoundStart();
              myPrevRevealedRef.current = false;
            }
            prevPhaseRef.current = message.lobby.phase;
            prevPlayerCountRef.current = message.lobby.players.length;
            setLobby(message.lobby);
            if (message.lobby.phase === "lobby") {
              setRound(null);
              setRoundResults(null);
            }
            return;
          }
          case "categories":
            setCategories(message.categories);
            return;
          case "customCategories":
            setLobbyCustomCategories(message.categories);
            return;
          case "roundState": {
            const mine = message.round.players.find((p) => p.id === myPlayerIdRef.current);
            if (mine?.revealed && !myPrevRevealedRef.current) {
              playReveal();
            }
            myPrevRevealedRef.current = mine?.revealed ?? false;
            setRound(message.round);
            return;
          }
          case "roundResults":
            if (message.results.gameOver) {
              playGameOver();
            } else {
              playRoundComplete();
            }
            setRoundResults(message.results);
            return;
          case "error":
            if (awaitingResumeRef.current) {
              // The saved session no longer resolves to anything (lobby gone, grace period
              // expired, server restarted). Fall back to the join screen quietly - the player
              // never did anything wrong, so a visible error banner would just be confusing.
              awaitingResumeRef.current = false;
              clearSession();
              resetLocalState();
              return;
            }
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
  }, [resetLocalState]);

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
    clearSession();
    resetLocalState();
  }, [send, resetLocalState]);
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
