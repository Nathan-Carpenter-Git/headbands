import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GAME_LIMITS } from "@headbands/shared";
import { useLobby } from "../state/useLobby";

export function Home() {
  const { createLobby, joinLobby, lobby, myPlayerId } = useLobby();
  const navigate = useNavigate();
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (lobby && myPlayerId) {
      navigate(`/lobby/${lobby.code}`, { replace: true });
    }
  }, [lobby, myPlayerId, navigate]);

  return (
    <div className="page">
      <div className="header-block hero">
        <h1>Guess what's on your card</h1>
        <p className="lede">Everyone else can see it. You can't. Ask around until you figure it out.</p>
      </div>

      <div className="card card-tilt-l">
        <h2>Start a new lobby</h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (createName.trim()) createLobby(createName.trim());
          }}
        >
          <div className="field">
            <label className="field-label" htmlFor="create-name">
              Your name
            </label>
            <input
              id="create-name"
              className="input"
              placeholder="e.g. Nathan"
              autoFocus
              maxLength={GAME_LIMITS.maxPlayerNameLength}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={!createName.trim()}>
            Create Lobby
          </button>
        </form>
      </div>

      <div className="card card-tilt-r">
        <h2>Join with a code</h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinName.trim() && joinCode.trim()) joinLobby(joinCode.trim(), joinName.trim());
          }}
        >
          <div className="input-row">
            <div className="field">
              <label className="field-label" htmlFor="join-code">
                Lobby code
              </label>
              <input
                id="join-code"
                className="input"
                placeholder="ABCD"
                maxLength={4}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="join-name">
                Your name
              </label>
              <input
                id="join-name"
                className="input"
                placeholder="e.g. Nathan"
                maxLength={GAME_LIMITS.maxPlayerNameLength}
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={!joinName.trim() || !joinCode.trim()}>
            Join Lobby
          </button>
        </form>
      </div>

      <Link to="/categories" className="btn btn-ghost btn-block">
        Manage your category library
      </Link>
    </div>
  );
}
