import { useCallback, useState } from "react";
import {
  buildCategory,
  exportAllCategories,
  exportCategory,
  loadLocalCategories,
  newCategoryId,
  parseImportedJson,
  saveLocalCategories,
  type ImportResult,
  type LocalCategory,
} from "../lib/localCategories";

export function useLocalCategories() {
  const [categories, setCategories] = useState<LocalCategory[]>(() => loadLocalCategories());

  const persist = useCallback((next: LocalCategory[]) => {
    setCategories(next);
    saveLocalCategories(next);
  }, []);

  const addCategory = useCallback(
    (name: string, cards: string[]): LocalCategory => {
      const category = buildCategory(newCategoryId(), name, cards);
      persist([...categories, category]);
      return category;
    },
    [categories, persist],
  );

  const updateCategory = useCallback(
    (id: string, name: string, cards: string[]): LocalCategory => {
      const updated = buildCategory(id, name, cards);
      persist(categories.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [categories, persist],
  );

  const removeCategory = useCallback(
    (id: string) => {
      persist(categories.filter((c) => c.id !== id));
    },
    [categories, persist],
  );

  const importFromText = useCallback(
    (text: string): ImportResult => {
      const result = parseImportedJson(text);
      if (result.imported.length > 0) {
        persist([...categories, ...result.imported]);
      }
      return result;
    },
    [categories, persist],
  );

  return {
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    importFromText,
    exportCategory,
    exportAll: () => exportAllCategories(categories),
  };
}
