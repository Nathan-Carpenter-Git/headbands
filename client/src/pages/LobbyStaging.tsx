import { useState } from "react";
import { Link } from "react-router-dom";
import { GAME_LIMITS, GAME_MODES, type GameMode, type LobbyStateDTO } from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { useLocalCategories } from "../state/useLocalCategories";
import { Avatar } from "../components/Avatar";
import { CategoryPicker, type PickerOption } from "../components/CategoryPicker";
import { copyText } from "../lib/clipboard";

export function LobbyStaging({ lobby }: { lobby: LobbyStateDTO }) {
  const { myPlayerId, categories, lobbyCustomCategories, updateSettings, uploadCategory, startRound } = useLobby();
  const { categories: localCategories } = useLocalCategories();
  const [copied, setCopied] = useState(false);
  const [roundsDraft, setRoundsDraft] = useState(String(lobby.settings.rounds));
  // Mirrors lobby.settings.rounds so we can detect external changes (the server confirming
  // a value, or another client changing it) during render, without a useEffect round-trip.
  const [syncedRounds, setSyncedRounds] = useState(lobby.settings.rounds);
  if (lobby.settings.rounds !== syncedRounds) {
    setSyncedRounds(lobby.settings.rounds);
    setRoundsDraft(String(lobby.settings.rounds));
  }
  const me = lobby.players.find((p) => p.id === myPlayerId);
  const mode = GAME_MODES[lobby.settings.gameMode];
  const enoughPlayers = lobby.players.length >= mode.minPlayers;
  const inviteLink = `${window.location.origin}/lobby/${lobby.code}`;

  const lobbyCustomIds = new Set(lobbyCustomCategories.map((c) => c.id));
  const pickerOptions: PickerOption[] = [
    ...categories.map((c) => ({ ...c, needsUpload: false })),
    ...lobbyCustomCategories.map((c) => ({ ...c, needsUpload: false })),
    ...localCategories
      .filter((c) => !lobbyCustomIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, cardCount: c.cards.length, needsUpload: true })),
  ];

  function changeCategories(nextIds: string[], added: PickerOption[]) {
    for (const option of added) {
      if (!option.needsUpload) continue;
      const full = localCategories.find((c) => c.id === option.id);
      if (full) uploadCategory(full);
    }
    updateSettings({ categoryIds: nextIds });
  }

  return (
    <div className="page">
      <div className="header-block">
        <span className="eyebrow">Lobby {lobby.code}</span>
        <h1>Waiting to start</h1>
      </div>

      <div className="invite-row">
        <span className="invite-link">{inviteLink}</span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            if (!(await copyText(inviteLink))) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="card">
        <h2>Players ({lobby.players.length})</h2>
        <ul className="player-list">
          {lobby.players.map((p) => (
            <li key={p.id} className="player-row">
              <Avatar name={p.name} />
              <span className="player-name">
                {p.name}
                {p.isLeader && <span className="badge badge-accent">Leader</span>}
                {p.id === myPlayerId && <span className="badge">You</span>}
                {!p.connected && <span className="badge badge-warning">Reconnecting</span>}
              </span>
              <span className="player-meta">
                <span className="player-score">{p.score}</span> {p.score === 1 ? "pt" : "pts"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {me?.isLeader ? (
        <div className="card">
          <div className="row-between">
            <h2>Settings</h2>
            <Link to="/categories" className="btn btn-ghost btn-sm">
              Manage categories
            </Link>
          </div>

          <div className="mode-picker" role="group" aria-label="Game mode">
            {(Object.keys(GAME_MODES) as GameMode[]).map((id) => (
              <button
                key={id}
                type="button"
                className="mode-option"
                aria-pressed={lobby.settings.gameMode === id}
                onClick={() => updateSettings({ gameMode: id })}
              >
                <span className="mode-option-label">{GAME_MODES[id].label}</span>
                <span className="mode-option-summary">{GAME_MODES[id].summary}</span>
              </button>
            ))}
          </div>

          <hr className="divider" />

          <CategoryPicker
            options={pickerOptions}
            selectedIds={lobby.settings.categoryIds}
            randomizeOrder={lobby.settings.randomizeOrder}
            onChange={changeCategories}
          />

          <hr className="divider" />

          <div className="row-between">
            <label className="field-label" htmlFor="rounds-input">
              Rounds
            </label>
            <input
              id="rounds-input"
              type="number"
              min={GAME_LIMITS.minRounds}
              max={GAME_LIMITS.maxRounds}
              className="input number-input"
              value={roundsDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setRoundsDraft(raw);
                const value = Number(raw);
                if (
                  raw.trim() !== "" &&
                  Number.isInteger(value) &&
                  value >= GAME_LIMITS.minRounds &&
                  value <= GAME_LIMITS.maxRounds
                ) {
                  updateSettings({ rounds: value });
                }
              }}
              onBlur={() => setRoundsDraft(String(lobby.settings.rounds))}
            />
          </div>

          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={lobby.settings.randomizeOrder}
              onChange={(e) => updateSettings({ randomizeOrder: e.target.checked })}
            />
            Randomize category order
          </label>

          {lobby.settings.gameMode === "headbands" && (
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={lobby.settings.autoRevealLast}
                onChange={(e) => updateSettings({ autoRevealLast: e.target.checked })}
              />
              Auto-reveal the last remaining player
            </label>
          )}

          <hr className="divider" />

          <button type="button" className="btn btn-primary btn-block" onClick={startRound} disabled={!enoughPlayers}>
            Start {mode.label}
          </button>
          {!enoughPlayers && (
            <p className="empty-hint">
              {mode.label} needs at least {mode.minPlayers} players to start.
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="row-between">
            <h2>Game mode</h2>
            <span className="badge badge-accent">{mode.label}</span>
          </div>
          <p className="lede">{mode.summary}</p>
          <p className="lede">Waiting for the leader to start the game…</p>
        </div>
      )}
    </div>
  );
}
