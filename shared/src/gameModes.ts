export type GameMode = "headbands" | "spybands";

export interface GameModeInfo {
  label: string;
  /** One line shown under the mode picker in the lobby. */
  summary: string;
  minPlayers: number;
}

export const GAME_MODES: Record<GameMode, GameModeInfo> = {
  headbands: {
    label: "Headbands",
    summary: "Everyone sees your card but you. Guess it before the others guess theirs.",
    minPlayers: 2,
  },
  spybands: {
    label: "Spybands",
    summary: "Everyone shares one card except the spy. Talk it out, then vote to catch them.",
    minPlayers: 3,
  },
};

export const SPYBANDS_RULES = {
  /** How long a majority accusation has to hold before it locks in. */
  lockInMs: 5_000,
  /** How long the spy has, once shown the card, to claim their guess was right. */
  guessMs: 5_000,
  /** Awarded to every non-spy when the spy is voted out. */
  pointsForCatchingSpy: 1,
  /** Awarded to the spy when the group votes out someone else. */
  pointsForSpyEscaping: 2,
  /** Awarded to the spy when they guess the card. */
  pointsForSpyGuessing: 4,
} as const;

/** "More than half" of `total`, the bar for both the card swap vote and the accusation vote. */
export function majorityOf(total: number): number {
  return Math.floor(total / 2) + 1;
}
