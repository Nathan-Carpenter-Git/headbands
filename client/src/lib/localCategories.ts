import { CATEGORY_LIMITS, type CategoryUploadDTO } from "@headbands/shared";

export type LocalCategory = CategoryUploadDTO;

const STORAGE_KEY = "headbands:categories";

export function loadLocalCategories(): LocalCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalCategories(categories: LocalCategory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch {
    // Storage full or unavailable (private browsing, etc.) - nothing we can do here.
  }
}

export function newCategoryId(): string {
  return `custom-${crypto.randomUUID()}`;
}

export function parseCardsText(text: string): string[] {
  return [...new Set(text.split("\n").map((line) => line.trim()).filter(Boolean))];
}

/** Validates and normalizes a name + card list. Throws with a user-facing message if invalid. */
export function buildCategory(id: string, name: string, cards: string[]): LocalCategory {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Give the category a name.");
  }
  if (trimmedName.length > CATEGORY_LIMITS.maxNameLength) {
    throw new Error(`Category name must be ${CATEGORY_LIMITS.maxNameLength} characters or fewer.`);
  }
  const cleanCards = [...new Set(cards.map((c) => c.trim()).filter(Boolean))];
  if (cleanCards.length < CATEGORY_LIMITS.minCards) {
    throw new Error(`Add at least ${CATEGORY_LIMITS.minCards} cards.`);
  }
  if (cleanCards.length > CATEGORY_LIMITS.maxCards) {
    throw new Error(`Too many cards (max ${CATEGORY_LIMITS.maxCards}).`);
  }
  const tooLong = cleanCards.find((c) => c.length > CATEGORY_LIMITS.maxCardLength);
  if (tooLong) {
    throw new Error(`"${tooLong}" is too long (max ${CATEGORY_LIMITS.maxCardLength} characters).`);
  }
  return { id, name: trimmedName, cards: cleanCards };
}

export interface ImportResult {
  imported: LocalCategory[];
  errors: string[];
}

/** Accepts either one exported category object or an array of them. Always mints fresh ids. */
export function parseImportedJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { imported: [], errors: ["That file isn't valid JSON."] };
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const imported: LocalCategory[] = [];
  const errors: string[] = [];
  entries.forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`Entry ${i + 1}: not a category object.`);
      return;
    }
    const { name, cards } = entry as { name?: unknown; cards?: unknown };
    if (typeof name !== "string" || !Array.isArray(cards)) {
      errors.push(`Entry ${i + 1}: missing "name" or "cards".`);
      return;
    }
    try {
      imported.push(buildCategory(newCategoryId(), name, cards.map(String)));
    } catch (err) {
      errors.push(`"${name || `Entry ${i + 1}`}": ${err instanceof Error ? err.message : "invalid"}`);
    }
  });
  return { imported, errors };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugForFile(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category";
}

export function exportCategory(category: LocalCategory): void {
  downloadJson(`${slugForFile(category.name)}.json`, { name: category.name, cards: category.cards });
}

export function exportAllCategories(categories: LocalCategory[]): void {
  downloadJson(
    "headbands-categories.json",
    categories.map((c) => ({ name: c.name, cards: c.cards })),
  );
}
