import {
  GAME_MODES,
  type HeadbandsRoundResultsDTO,
  type LobbyStateDTO,
  type RoundResultsDTO,
  type SpybandsOutcome,
  type SpybandsRoundResultsDTO,
} from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { Avatar } from "../components/Avatar";

export function ResultsView({ lobby, results }: { lobby: LobbyStateDTO; results: RoundResultsDTO | null }) {
  const { myPlayerId, startRound, playAgain } = useLobby();
  const me = lobby.players.find((p) => p.id === myPlayerId);
  const standings = [...lobby.players].sort((a, b) => b.score - a.score);
  const mode = GAME_MODES[lobby.settings.gameMode];
  const enoughPlayers = lobby.players.length >= mode.minPlayers;

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

      {results?.mode === "headbands" && <HeadbandsRoundCard results={results} />}
      {results?.mode === "spybands" && <SpybandsRoundCard results={results} />}

      <div className="card">
        <h2>{results?.gameOver ? "Final standings" : "Standings"}</h2>
        <ol className="placement-list">
          {standings.map((p) => {
            // Tied players share a rank (1, 1, 3), so a tie never looks like one player is ahead.
            const rank = 1 + standings.filter((other) => other.score > p.score).length;
            return (
              <li key={p.id} className="placement-row">
                <span className={`placement-rank${rank === 1 ? " is-first" : ""}`}>{rank}</span>
                <Avatar name={p.name} />
                <span className="placement-name">
                  {p.name}
                  {p.id === myPlayerId && <span className="badge">You</span>}
                  {!p.connected && <span className="badge badge-warning">Reconnecting</span>}
                </span>
                <span className="placement-points">
                  {p.score} {p.score === 1 ? "pt" : "pts"}
                </span>
              </li>
            );
          })}
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
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={startRound} disabled={!enoughPlayers}>
            Start Next Round
          </button>
          {!enoughPlayers && (
            <p className="empty-hint">
              {mode.label} needs at least {mode.minPlayers} players to start.
            </p>
          )}
        </div>
      ) : (
        <p className="lede">Waiting for the leader to start the next round…</p>
      )}
    </div>
  );
}

function HeadbandsRoundCard({ results }: { results: HeadbandsRoundResultsDTO }) {
  return (
    <div className="card">
      <h2>This round</h2>
      <ol className="placement-list">
        {results.placements.map((p, i) => (
          <li key={p.playerId} className="placement-row">
            <span className={`placement-rank${i === 0 ? " is-first" : ""}`}>{i + 1}</span>
            <Avatar name={p.name} />
            <span className="placement-name">{p.name}</span>
            <span className="placement-card">{p.card}</span>
            <span className="placement-points">+{p.pointsAwarded}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function outcomeHeadline(results: SpybandsRoundResultsDTO): string {
  const headlines: Record<SpybandsOutcome, string> = {
    caught: `${results.spyName} was the spy, and got caught`,
    escaped: `${results.spyName} was the spy, and got away`,
    spyLeft: `${results.spyName} was the spy, but left the game`,
    tooFewPlayers: "Too many players left to finish the round",
  };
  return headlines[results.outcome];
}

function outcomeDetail(results: SpybandsRoundResultsDTO): string {
  switch (results.outcome) {
    case "caught":
      return "Everyone who wasn't the spy gets a point.";
    case "escaped":
      return `The vote landed on ${results.accusedName}, so the spy gets 2 points.`;
    case "spyLeft":
    case "tooFewPlayers":
      return "The round was called off, so nobody scores.";
  }
}

function SpybandsRoundCard({ results }: { results: SpybandsRoundResultsDTO }) {
  return (
    <div className="card">
      <h2>This round</h2>
      <div className={`outcome outcome-${results.outcome}`}>
        <strong className="outcome-headline">{outcomeHeadline(results)}</strong>
        <span className="outcome-detail">{outcomeDetail(results)}</span>
      </div>
      <div className="row-between">
        <span className="field-label">The card was</span>
        <span className="outcome-card">{results.card}</span>
      </div>
      <ol className="placement-list">
        {results.players.map((p) => (
          <li key={p.playerId} className="placement-row">
            <Avatar name={p.name} />
            <span className="placement-name">{p.name}</span>
            {p.isSpy && <span className="badge badge-danger">Spy</span>}
            <span className="placement-card">
              {p.votesReceived} {p.votesReceived === 1 ? "vote" : "votes"}
            </span>
            <span className="placement-points">+{p.pointsAwarded}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
