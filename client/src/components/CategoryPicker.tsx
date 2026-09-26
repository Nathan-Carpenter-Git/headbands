import { useState } from "react";
import type { CategorySummaryDTO } from "@headbands/shared";

export interface PickerOption extends CategorySummaryDTO {
  /** True for a category from this browser's library that hasn't been sent to the lobby yet. */
  needsUpload: boolean;
}

/** One row in the picker: a whole category, which may have been dealt into several parts. */
interface Family {
  key: string;
  name: string;
  section: string;
  parts: PickerOption[];
  cardCount: number;
  fromLibrary: boolean;
}

const ALL = "All";
const LIBRARY_SECTION = "Your Library";

function groupIntoFamilies(options: PickerOption[]): Family[] {
  const families = new Map<string, Family>();
  for (const option of options) {
    const key = option.group?.id ?? option.id;
    let family = families.get(key);
    if (!family) {
      family = {
        key,
        name: option.group?.name ?? option.name,
        section: option.section ?? LIBRARY_SECTION,
        parts: [],
        cardCount: 0,
        fromLibrary: option.needsUpload,
      };
      families.set(key, family);
    }
    family.parts.push(option);
    family.cardCount += option.cardCount;
  }
  return [...families.values()];
}

interface CategoryPickerProps {
  options: PickerOption[];
  /** In play order. */
  selectedIds: string[];
  /** When false, the selection order is the round order, so the chips show their number. */
  randomizeOrder: boolean;
  onChange: (nextIds: string[], added: PickerOption[]) => void;
}

export function CategoryPicker({ options, selectedIds, randomizeOrder, onChange }: CategoryPickerProps) {
  const [section, setSection] = useState(ALL);
  const [search, setSearch] = useState("");

  const families = groupIntoFamilies(options);
  const sections = [...new Set(families.map((f) => f.section))];
  const activeSection = sections.includes(section) ? section : ALL;
  const optionById = new Map(options.map((o) => [o.id, o]));
  const selected = new Set(selectedIds);

  const query = search.trim().toLowerCase();
  const visibleFamilies = families.filter(
    (f) =>
      (activeSection === ALL || f.section === activeSection) &&
      (!query || f.name.toLowerCase().includes(query) || f.section.toLowerCase().includes(query)),
  );
  const visibleParts = visibleFamilies.flatMap((f) => f.parts);
  const allVisibleSelected = visibleParts.length > 0 && visibleParts.every((p) => selected.has(p.id));
  const anyVisibleSelected = visibleParts.some((p) => selected.has(p.id));
  const filtered = query !== "" || activeSection !== ALL;

  function add(parts: PickerOption[]) {
    const toAdd = parts.filter((p) => !selected.has(p.id));
    if (toAdd.length > 0) onChange([...selectedIds, ...toAdd.map((p) => p.id)], toAdd);
  }

  function remove(parts: PickerOption[]) {
    const ids = new Set(parts.map((p) => p.id));
    onChange(selectedIds.filter((id) => !ids.has(id)), []);
  }

  function selectedInSection(name: string): number {
    return selectedIds.filter((id) => {
      const option = optionById.get(id);
      return option !== undefined && (option.section ?? LIBRARY_SECTION) === name;
    }).length;
  }

  return (
    <div className="field">
      <div className="row-between">
        <span className="field-label">Categories</span>
        {selectedIds.length > 0 && (
          <button type="button" className="link-button" onClick={() => onChange([], [])}>
            Clear all
          </button>
        )}
      </div>

      <div className="selected-tray" aria-live="polite">
        {selectedIds.length === 0 ? (
          <p className="selected-empty">Nothing picked yet. Choose at least one category below.</p>
        ) : (
          <>
            <span className="selected-count">
              {selectedIds.length} selected{!randomizeOrder && selectedIds.length > 1 ? ", played in this order" : ""}
            </span>
            <ul className="chip-list">
              {selectedIds.map((id, i) => {
                const name = optionById.get(id)?.name ?? "Unavailable category";
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onChange(selectedIds.filter((existing) => existing !== id), [])}
                      aria-label={`Remove ${name}`}
                      title={`Remove ${name}`}
                    >
                      {!randomizeOrder && selectedIds.length > 1 && <span className="chip-order">{i + 1}</span>}
                      <span className="chip-label">{name}</span>
                      <span className="chip-remove" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <input
        type="search"
        className="input"
        placeholder="Search categories"
        aria-label="Search categories"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          // A search always looks through every section, so a match is never hidden by a tab.
          if (e.target.value.trim()) setSection(ALL);
        }}
      />

      {sections.length > 1 && (
        <div className="section-tabs" role="group" aria-label="Category sections">
          {[ALL, ...sections].map((name) => {
            const count = name === ALL ? 0 : selectedInSection(name);
            return (
              <button
                key={name}
                type="button"
                className="section-tab"
                aria-pressed={activeSection === name}
                onClick={() => setSection(name)}
              >
                {name}
                {count > 0 && <span className="section-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {options.length > 1 && (
        <div className="category-actions">
          <button type="button" className="btn btn-sm" onClick={() => add(visibleParts)} disabled={allVisibleSelected}>
            {filtered ? "Select shown" : "Select all"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => remove(visibleParts)}
            disabled={!anyVisibleSelected}
          >
            {filtered ? "Clear shown" : "Clear"}
          </button>
        </div>
      )}

      <div className="category-picker">
        {sections
          .filter((name) => visibleFamilies.some((f) => f.section === name))
          .map((name) => (
            <section key={name} className="picker-section" aria-label={name}>
              {activeSection === ALL && <h3 className="picker-section-title">{name}</h3>}
              {visibleFamilies
                .filter((f) => f.section === name)
                .map((family) => (
                  <FamilyRow key={family.key} family={family} selected={selected} onAdd={add} onRemove={remove} />
                ))}
            </section>
          ))}
        {options.length === 0 && <p className="empty-hint">No categories available.</p>}
        {options.length > 0 && visibleFamilies.length === 0 && (
          <p className="empty-hint">No categories match that search.</p>
        )}
      </div>
    </div>
  );
}

interface FamilyRowProps {
  family: Family;
  selected: Set<string>;
  onAdd: (parts: PickerOption[]) => void;
  onRemove: (parts: PickerOption[]) => void;
}

function FamilyRow({ family, selected, onAdd, onRemove }: FamilyRowProps) {
  const pickedCount = family.parts.filter((p) => selected.has(p.id)).length;
  const all = pickedCount === family.parts.length;
  const some = pickedCount > 0 && !all;
  const split = family.parts.length > 1;

  return (
    <div className="family-row">
      <label className="checkbox-option">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = some;
          }}
          onChange={() => (all ? onRemove(family.parts) : onAdd(family.parts))}
        />
        <span className="family-name">{family.name}</span>
        <span className="option-hint">
          {split ? `${family.parts.length} parts · ` : ""}
          {family.cardCount} cards{family.fromLibrary ? " · your library" : ""}
        </span>
      </label>
      {split && (
        <div className="part-toggles" role="group" aria-label={`${family.name} parts`}>
          {family.parts.map((part) => {
            const on = selected.has(part.id);
            return (
              <button
                key={part.id}
                type="button"
                className="part-toggle"
                aria-pressed={on}
                aria-label={part.name}
                title={`${part.name} · ${part.cardCount} cards`}
                onClick={() => (on ? onRemove([part]) : onAdd([part]))}
              >
                #{part.group?.part}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
