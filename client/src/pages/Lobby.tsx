import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLobby } from "../state/useLobby";
import { LobbyStaging } from "./LobbyStaging";
import { RoundView } from "./RoundView";
import { ResultsView } from "./ResultsView";

export function Lobby() {
  const { code = "" } = useParams();
  const { lobby, myPlayerId, round, roundResults, joinLobby } = useLobby();
  const [joinName, setJoinName] = useState("");

  const haveJoinedThisLobby = lobby?.code === code.toUpperCase() && myPlayerId;

  if (!haveJoinedThisLobby) {
    return (
      <div className="page">
        <div className="header-block">
          <span className="eyebrow">Invite</span>
          <h1>Join lobby {code.toUpperCase()}</h1>
        </div>
        <div className="card">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinName.trim()) joinLobby(code, joinName.trim());
            }}
          >
            <div className="field">
              <label className="field-label" htmlFor="join-name">
                Your name
              </label>
              <input
                id="join-name"
                className="input"
                placeholder="e.g. Nathan"
                autoFocus
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={!joinName.trim()}>
              Join Lobby
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (lobby.phase === "round") {
    return round ? <RoundView round={round} /> : <div className="page">Dealing cards…</div>;
  }
  if (lobby.phase === "results") {
    return <ResultsView lobby={lobby} results={roundResults} />;
  }
  return <LobbyStaging lobby={lobby} />;
}
