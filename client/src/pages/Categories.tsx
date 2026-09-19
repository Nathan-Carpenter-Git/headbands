import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_LIMITS } from "@headbands/shared";
import { useLocalCategories } from "../state/useLocalCategories";
import type { LocalCategory } from "../lib/localCategories";

export function Categories() {
  const { categories, addCategory, updateCategory, removeCategory, importFromText, exportCategory, exportAll } =
    useLocalCategories();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cardsText, setCardsText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startNew() {
    setEditingId(null);
    setName("");
    setCardsText("");
    setFormError(null);
  }

  function startEdit(category: LocalCategory) {
    setEditingId(category.id);
    setName(category.name);
    setCardsText(category.cards.join("\n"));
    setFormError(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cards = cardsText.split("\n");
      if (editingId) {
        updateCategory(editingId, name, cards);
      } else {
        addCategory(name, cards);
      }
      startNew();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save that category.");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = importFromText(text);
    const parts: string[] = [];
    if (result.imported.length > 0) parts.push(`Added ${result.imported.length} categor${result.imported.length === 1 ? "y" : "ies"}.`);
    if (result.errors.length > 0) parts.push(...result.errors);
    setImportMessage(parts.join(" ") || "Nothing to import.");
  }

  return (
    <div className="page">
      <div className="header-block">
        <span className="eyebrow">Your device only</span>
        <h1>Category library</h1>
        <p className="lede">
          Categories you add here are saved in this browser, no account needed. Use them in any lobby you lead,
          or export them to share with someone else.
        </p>
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
          Import from file
        </button>
        <button type="button" className="btn" onClick={exportAll} disabled={categories.length === 0}>
          Export all
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </div>
      {importMessage && (
        <div className="banner" style={{ position: "static", width: "auto" }}>
          <span>{importMessage}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        <h2>{editingId ? "Edit category" : "New category"}</h2>
        <form className="stack" onSubmit={handleSave}>
          <div className="field">
            <label className="field-label" htmlFor="category-name">
              Name
            </label>
            <input
              id="category-name"
              className="input"
              placeholder="e.g. 90s Cartoons"
              maxLength={CATEGORY_LIMITS.maxNameLength}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="category-cards">
              Cards (one per line)
            </label>
            <textarea
              id="category-cards"
              className="input textarea"
              rows={6}
              placeholder={"Rugrats\nDoug\nHey Arnold!"}
              value={cardsText}
              onChange={(e) => setCardsText(e.target.value)}
            />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="row">
            <button type="submit" className="btn btn-primary">
              {editingId ? "Save changes" : "Add category"}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={startNew}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Your categories ({categories.length})</h2>
        {categories.length === 0 ? (
          <p className="empty-hint">Nothing here yet. Add one above, or import a file.</p>
        ) : (
          <ul className="category-list">
            {categories.map((c) => (
              <li key={c.id} className="category-row">
                <div>
                  <div className="player-name">{c.name}</div>
                  <div className="option-hint">{c.cards.length} cards</div>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => exportCategory(c)}>
                    Export
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (editingId === c.id) startNew();
                      removeCategory(c.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/" className="btn btn-ghost btn-block">
        Back home
      </Link>
    </div>
  );
}
