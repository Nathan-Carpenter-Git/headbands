import type { LobbyStateDTO, RoundResultsDTO } from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { Avatar } from "../components/Avatar";

export function ResultsView({ lobby, results }: { lobby: LobbyStateDTO; results: RoundResultsDTO | null }) {
  const { myPlayerId, startRound, playAgain } = useLobby();
  const me = lobby.players.find((p) => p.id === myPlayerId);
  const standings = [...lobby.players].sort((a, b) => b.score - a.score);

  return (
    <div className="page">
      <div className="header-block">
        <span className="eyebrow">{results ? results.categoryName : "Results"}</span>
        <h1>
          {results?.gameOver
            ? "Game over"
            : results
              ? `Round ${results.roundNumber} of ${results.totalRounds} results`
              : "Round results"}
        </h1>
      </div>

      {results && (
        <div className="card">
          <h2>This round</h2>
          <ol className="placement-list">
            {results.placements.map((p, i) => (
              <li key={p.playerId} className="placement-row">
                <span className="placement-rank">{i + 1}</span>
                <Avatar name={p.name} />
                <span className="placement-name">{p.name}</span>
                <span className="placement-card">{p.card}</span>
                <span className="placement-points">+{p.pointsAwarded}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="card">
        <h2>{results?.gameOver ? "Final standings" : "Standings"}</h2>
        <ol className="placement-list">
          {standings.map((p, i) => (
            <li key={p.id} className="placement-row">
              <span className="placement-rank">{i + 1}</span>
              <Avatar name={p.name} />
              <span className="placement-name">
                {p.name}
                {p.id === myPlayerId && <span className="badge">You</span>}
                {!p.connected && <span className="badge badge-warning">Reconnecting</span>}
              </span>
              <span className="placement-points">{p.score} pts</span>
            </li>
          ))}
        </ol>
      </div>

      {results?.gameOver ? (
        me?.isLeader ? (
          <button type="button" className="btn btn-primary btn-block" onClick={playAgain}>
            Play Again
          </button>
        ) : (
          <p className="lede">Waiting for the leader to start a new game…</p>
        )
      ) : me?.isLeader ? (
        <button type="button" className="btn btn-primary btn-block" onClick={startRound}>
          Start Next Round
        </button>
      ) : (
        <p className="lede">Waiting for the leader to start the next round…</p>
      )}
    </div>
  );
}
