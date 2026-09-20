import { useState } from "react";
import { Link } from "react-router-dom";
import { GAME_LIMITS, type LobbyStateDTO } from "@headbands/shared";
import { useLobby } from "../state/useLobby";
import { useLocalCategories } from "../state/useLocalCategories";
import { Avatar } from "../components/Avatar";

export function LobbyStaging({ lobby }: { lobby: LobbyStateDTO }) {
  const { myPlayerId, categories, lobbyCustomCategories, updateSettings, uploadCategory, startRound } = useLobby();
  const { categories: localCategories } = useLocalCategories();
  const [copied, setCopied] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [roundsDraft, setRoundsDraft] = useState(String(lobby.settings.rounds));
  // Mirrors lobby.settings.rounds so we can detect external changes (the server confirming
  // a value, or another client changing it) during render, without a useEffect round-trip.
  const [syncedRounds, setSyncedRounds] = useState(lobby.settings.rounds);
  if (lobby.settings.rounds !== syncedRounds) {
    setSyncedRounds(lobby.settings.rounds);
    setRoundsDraft(String(lobby.settings.rounds));
  }
  const me = lobby.players.find((p) => p.id === myPlayerId);
  const inviteLink = `${window.location.origin}/lobby/${lobby.code}`;

  const lobbyCustomIds = new Set(lobbyCustomCategories.map((c) => c.id));
  const selectableCategories = [
    ...categories.map((c) => ({ ...c, needsUpload: false })),
    ...lobbyCustomCategories.map((c) => ({ ...c, needsUpload: false })),
    ...localCategories
      .filter((c) => !lobbyCustomIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, cardCount: c.cards.length, needsUpload: true })),
  ];

  const filterText = categoryFilter.trim().toLowerCase();
  const visibleCategories = filterText
    ? selectableCategories.filter((c) => c.name.toLowerCase().includes(filterText))
    : selectableCategories;
  const selectedCount = lobby.settings.categoryIds.length;

  function toggleCategory(id: string, checked: boolean, needsUpload: boolean) {
    if (checked && needsUpload) {
      const full = localCategories.find((c) => c.id === id);
      if (full) uploadCategory(full);
    }
    const next = checked
      ? [...lobby.settings.categoryIds, id]
      : lobby.settings.categoryIds.filter((existing) => existing !== id);
    updateSettings({ categoryIds: next });
  }

  const selectedIds = new Set(lobby.settings.categoryIds);
  const allVisibleSelected = visibleCategories.length > 0 && visibleCategories.every((c) => selectedIds.has(c.id));
  const anyVisibleSelected = visibleCategories.some((c) => selectedIds.has(c.id));
  const selectLabel = filterText ? "Select shown" : "Select all";
  const clearLabel = filterText ? "Clear shown" : "Clear";

  function selectVisible() {
    const toAdd = visibleCategories.filter((c) => !selectedIds.has(c.id));
    for (const c of toAdd) {
      if (!c.needsUpload) continue;
      const full = localCategories.find((local) => local.id === c.id);
      if (full) uploadCategory(full);
    }
    updateSettings({ categoryIds: [...lobby.settings.categoryIds, ...toAdd.map((c) => c.id)] });
  }

  function clearVisible() {
    const visibleIds = new Set(visibleCategories.map((c) => c.id));
    updateSettings({ categoryIds: lobby.settings.categoryIds.filter((id) => !visibleIds.has(id)) });
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
          onClick={() => {
            navigator.clipboard.writeText(inviteLink);
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
                <span className="player-score">{p.score}</span> pts
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

          <div className="field">
            <div className="row-between">
              <span className="field-label">Categories</span>
              <span className="option-hint">{selectedCount} selected</span>
            </div>
            {selectableCategories.length > 8 && (
              <input
                type="search"
                className="input"
                placeholder="Search categories"
                aria-label="Search categories"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            )}
            {selectableCategories.length > 1 && (
              <div className="category-actions">
                <button type="button" className="btn btn-sm" onClick={selectVisible} disabled={allVisibleSelected}>
                  {selectLabel}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearVisible} disabled={!anyVisibleSelected}>
                  {clearLabel}
                </button>
              </div>
            )}
            <div className="category-picker">
              {visibleCategories.map((c) => (
                <label key={c.id} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={lobby.settings.categoryIds.includes(c.id)}
                    onChange={(e) => toggleCategory(c.id, e.target.checked, c.needsUpload)}
                  />
                  {c.name}
                  <span className="option-hint">
                    {c.cardCount} cards{c.needsUpload ? " · your library" : ""}
                  </span>
                </label>
              ))}
              {selectableCategories.length === 0 && <p className="empty-hint">No categories available.</p>}
              {selectableCategories.length > 0 && visibleCategories.length === 0 && (
                <p className="empty-hint">No categories match that search.</p>
              )}
            </div>
          </div>

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

          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={lobby.settings.autoRevealLast}
              onChange={(e) => updateSettings({ autoRevealLast: e.target.checked })}
            />
            Auto-reveal the last remaining player
          </label>

          <hr className="divider" />

          <button type="button" className="btn btn-primary btn-block" onClick={startRound} disabled={lobby.players.length < 2}>
            Start Game
          </button>
          {lobby.players.length < 2 && <p className="empty-hint">Need at least 2 players to start.</p>}
        </div>
      ) : (
        <div className="card">
          <p className="lede">Waiting for the leader to start the game…</p>
        </div>
      )}
    </div>
  );
}
