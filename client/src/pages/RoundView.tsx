import type { RoundStateDTO } from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { Avatar } from "../components/Avatar";

export function RoundView({ round }: { round: RoundStateDTO }) {
  const { myPlayerId, swapCard, revealCard } = useLobby();
  const me = round.players.find((p) => p.id === myPlayerId);

  return (
    <div className="page">
      <div className="header-block">
        <span className="eyebrow">
          Round {round.roundNumber} of {round.totalRounds} · {round.categoryName}
        </span>
        <h1>What's on your card?</h1>
        <p className="lede">Ask yes/no questions over voice chat, then reveal once you've got it.</p>
      </div>

      <div className="card">
        <ul className="card-tile-list">
          {round.players.map((p) => {
            const isMe = p.id === myPlayerId;
            const hidden = isMe && !p.revealed;
            return (
              <li key={p.id} className={`card-tile${isMe ? " is-you" : ""}`}>
                <Avatar name={p.name} />
                <span className="player-name">
                  {p.name}
                  {isMe && <span className="badge">You</span>}
                </span>
                <span className={`card-tile-value${hidden ? " is-hidden" : ""}`}>
                  {hidden ? "Hidden from you" : p.card}
                  {p.revealed && <div className="card-tile-place">Revealed · place {p.place}</div>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {me && !me.revealed && (
        <div className="row">
          <button type="button" className="btn" onClick={swapCard}>
            Swap my card
          </button>
          <button type="button" className="btn btn-primary" onClick={revealCard}>
            I got it — reveal my card
          </button>
        </div>
      )}
      {me?.revealed && (
        <p className="lede">
          You revealed in place {me.place}. Waiting on everyone else…
        </p>
      )}
    </div>
  );
}
