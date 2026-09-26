export const CATEGORY_LIMITS = {
  minCards: 2,
  maxCards: 300,
  maxNameLength: 60,
  maxCardLength: 60,
  /** Base categories bigger than this are dealt into parts of at most this many cards. */
  maxCardsPerPart: 40,
} as const;
