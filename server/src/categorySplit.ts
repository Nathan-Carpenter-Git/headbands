import type { CategoryGroupDTO } from "@headbands/shared";

export interface SplittableCategory {
  id: string;
  name: string;
  cards: string[];
}

export type CategoryPart<T extends SplittableCategory> = T & { group?: CategoryGroupDTO };

/**
 * Deals a category's cards round robin into the fewest parts of at most maxPerPart cards, so
 * every part gets an even mix of the whole pool and part sizes differ by at most one. The
 * deal is deterministic, so "Movies #2" is the same set of cards on every server start.
 * Categories that already fit are returned unchanged, without a group.
 */
export function splitCategory<T extends SplittableCategory>(category: T, maxPerPart: number): CategoryPart<T>[] {
  const parts = Math.ceil(category.cards.length / maxPerPart);
  if (parts <= 1) return [category];
  const hands: string[][] = Array.from({ length: parts }, () => []);
  category.cards.forEach((card, i) => hands[i % parts].push(card));
  return hands.map((cards, i) => ({
    ...category,
    id: `${category.id}-${i + 1}`,
    name: `${category.name} #${i + 1}`,
    cards,
    group: { id: category.id, name: category.name, part: i + 1, parts },
  }));
}
