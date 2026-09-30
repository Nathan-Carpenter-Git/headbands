import { useEffect, useState } from "react";
import { SPYBANDS_RULES, type SpybandsPlayerViewDTO, type SpybandsRoundStateDTO } from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { Avatar } from "../components/Avatar";
import { playCountdownTick } from "../lib/sound";

export function SpybandsRoundView({ round }: { round: SpybandsRoundStateDTO }) {
  const { myPlayerId } = useLobby();
  const me = round.players.find((p) => p.id === myPlayerId);
  const { title, lede } = heading(round);

  return (
    <div className="page">
      <div className="header-block">
        <span className="eyebrow">
          Spybands · Round {round.roundNumber} of {round.totalRounds} · {round.categoryName}
        </span>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>

      <SecretCard round={round} />

      {round.stage === "choosing" ? <ChoosingStage round={round} me={me} /> : <VotingStage round={round} />}
    </div>
  );
}

function heading(round: SpybandsRoundStateDTO): { title: string; lede: string } {
  if (round.stage === "choosing") {
    return round.isSpy
      ? { title: "You're the spy", lede: "Everyone else is looking at the same card. Blend in while they settle on it." }
      : {
          title: "Agree on the card",
          lede: "Everyone but the spy sees this card. Vote to swap it, or ready up to play with it.",
        };
  }
  if (round.guess) {
    return round.isSpy
      ? { title: "Did you get it?", lede: "Here's the card. If it's what you said out loud, claim it before time runs out." }
      : { title: "The spy is guessing", lede: "The spy said their guess out loud. Voting is paused while they check the card." };
  }
  return {
    title: "Find the spy",
    lede: round.isSpy
      ? "Ask each other anything over voice chat. Blend in, or guess the card if you think you know it."
      : "Ask each other anything over voice chat. When you know who the spy is, vote for them.",
  };
}

function SecretCard({ round }: { round: SpybandsRoundStateDTO }) {
  if (round.isSpy && round.card !== null) {
    return (
      <div className="secret-card">
        <span className="secret-card-label">The card</span>
        <span className="secret-card-value">{round.card}</span>
        <span className="secret-card-hint">Only you can see this. Be honest about whether you got it.</span>
      </div>
    );
  }
  if (round.isSpy) {
    return (
      <div className="secret-card is-spy">
        <span className="secret-card-label">Your role</span>
        <span className="secret-card-value">Spy</span>
        <span className="secret-card-hint">Work out the card from what everyone says, without getting caught.</span>
      </div>
    );
  }
  return (
    <div className="secret-card">
      <span className="secret-card-label">The card</span>
      <span className="secret-card-value">{round.card}</span>
      <span className="secret-card-hint">One player can't see this. Keep it vague enough that they can't guess it.</span>
    </div>
  );
}

function ChoosingStage({ round, me }: { round: SpybandsRoundStateDTO; me: SpybandsPlayerViewDTO | undefined }) {
  const { myPlayerId, spyVoteSwap, spyReady } = useLobby();
  const swapVotes = round.players.filter((p) => p.votedSwap).length;
  const readyCount = round.players.filter((p) => p.ready).length;

  return (
    <>
      <div className="card">
        <div className="row-between">
          <h2>Players</h2>
          <span className="tally">
            {readyCount}/{round.players.length} ready
          </span>
        </div>
        <ul className="player-list">
          {round.players.map((p) => (
            <li key={p.id} className="player-row">
              <Avatar name={p.name} />
              <span className="player-name">
                {p.name}
                {p.id === myPlayerId && <span className="badge">You</span>}
                {!p.connected && <span className="badge badge-warning">Reconnecting</span>}
              </span>
              <span className="player-meta">
                {p.ready && <span className="badge badge-success">Ready</span>}
                {p.votedSwap && <span className="badge badge-warning">Wants swap</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {me && (
        <div className="stack">
          <div className="action-row">
            <button
              type="button"
              className="btn"
              aria-pressed={me.votedSwap}
              onClick={() => spyVoteSwap(!me.votedSwap)}
            >
              {me.votedSwap ? "Undo swap vote" : "Vote to swap card"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              aria-pressed={me.ready}
              onClick={() => spyReady(!me.ready)}
            >
              {me.ready ? "Not ready" : "Ready"}
            </button>
          </div>
          <p className="empty-hint">
            Swap votes: {swapVotes} of {round.majority} needed. The round starts once everyone is ready.
          </p>
        </div>
      )}
    </>
  );
}

function VotingStage({ round }: { round: SpybandsRoundStateDTO }) {
  const { myPlayerId, spyAccuse } = useLobby();
  const me = round.players.find((p) => p.id === myPlayerId);
  const votesFor = new Map<string, number>();
  for (const p of round.players) {
    if (p.accusing) votesFor.set(p.accusing, (votesFor.get(p.accusing) ?? 0) + 1);
  }
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? "?";

  const frozen = round.guess !== null;

  return (
    <>
      {round.guess && round.isSpy && <GuessClaim remainingMs={round.guess.remainingMs} />}
      {round.guess && !round.isSpy && (
        <Countdown
          key="guess"
          remainingMs={round.guess.remainingMs}
          title="The spy is checking their guess"
          detail="If they got it, the spy wins the round. If not, everyone else scores."
        />
      )}
      {round.lockIn && (
        <Countdown
          key={round.lockIn.targetId}
          remainingMs={round.lockIn.remainingMs}
          title={`Locking in on ${nameOf(round.lockIn.targetId)}`}
          detail="Change your vote to stop the countdown."
        />
      )}

      <div className="card">
        <div className="row-between">
          <h2>Vote for the spy</h2>
          <span className="tally">
            {round.majority} of {round.players.length} to lock in
          </span>
        </div>
        <ul className="player-list">
          {round.players.map((p) => {
            const isMe = p.id === myPlayerId;
            const mine = me?.accusing === p.id;
            const votes = votesFor.get(p.id) ?? 0;
            return (
              <li key={p.id} className={`player-row vote-row${round.lockIn?.targetId === p.id ? " is-locking" : ""}`}>
                <Avatar name={p.name} />
                <span className="player-name">
                  {p.name}
                  {isMe && <span className="badge">You</span>}
                  {!p.connected && <span className="badge badge-warning">Reconnecting</span>}
                </span>
                <span className="player-meta">
                  <span className="vote-count" aria-label={`${votes} ${votes === 1 ? "vote" : "votes"}`}>
                    {votes} {votes === 1 ? "vote" : "votes"}
                  </span>
                  {isMe || !me ? (
                    <span className="vote-button-spacer" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className={`btn btn-sm${mine ? " btn-primary" : ""}`}
                      aria-pressed={mine}
                      disabled={frozen}
                      onClick={() => spyAccuse(mine ? null : p.id)}
                    >
                      {mine ? "Voted" : "Vote"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {!frozen && (
        <p className="empty-hint">
          {me?.accusing
            ? `You're voting for ${nameOf(me.accusing)}. Tap Voted to take it back.`
            : "You haven't voted yet. You can change your vote any time until it locks in."}
        </p>
      )}

      {round.isSpy && !frozen && <GuessButton locking={round.lockIn !== null} />}
    </>
  );
}

/** The spy's one shot at the card: say it out loud, confirm, and only then see the card. */
function GuessButton({ locking }: { locking: boolean }) {
  const { spyStartGuess } = useLobby();
  const [confirming, setConfirming] = useState(false);
  const seconds = SPYBANDS_RULES.guessMs / 1000;

  if (locking) {
    return <p className="empty-hint">Too late to guess the card: the vote is locking in.</p>;
  }
  if (!confirming) {
    return (
      <button type="button" className="btn btn-block" onClick={() => setConfirming(true)}>
        Guess the card
      </button>
    );
  }
  return (
    <div className="card">
      <h2>Say your guess out loud</h2>
      <p className="lede">
        You only get one. Once everyone's heard it, you'll see the card and have {seconds} seconds to claim you got
        it, or it counts as a miss.
      </p>
      <div className="action-row">
        <button type="button" className="btn" onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={spyStartGuess}>
          Show the card
        </button>
      </div>
    </div>
  );
}

function GuessClaim({ remainingMs }: { remainingMs: number }) {
  const { spyFinishGuess } = useLobby();
  return (
    <div className="stack">
      <Countdown
        key="guess"
        remainingMs={remainingMs}
        title="Claim it before time runs out"
        detail="If you don't pick, it counts as a miss."
      />
      <div className="action-row">
        <button type="button" className="btn" onClick={() => spyFinishGuess(false)}>
          I missed it
        </button>
        <button type="button" className="btn btn-primary" onClick={() => spyFinishGuess(true)}>
          I got it
        </button>
      </div>
    </div>
  );
}

/**
 * Counts down from the server's remaining time, measured from when this client received it,
 * so a clock difference between the browser and the server can't skew it. Keyed in the parent
 * (by accusation target, or "guess"), so a new countdown starts fresh.
 */
function Countdown({ remainingMs, title, detail }: { remainingMs: number; title: string; detail: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(remainingMs / 1000));

  useEffect(() => {
    const deadline = performance.now() + remainingMs;
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
    }, 100);
    return () => clearInterval(timer);
  }, [remainingMs]);

  useEffect(() => {
    if (secondsLeft > 0) playCountdownTick(secondsLeft);
  }, [secondsLeft]);

  return (
    <div className="lock-in" role="status" aria-live="polite">
      <span className="lock-in-seconds">{secondsLeft}</span>
      <span className="lock-in-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </div>
  );
}
