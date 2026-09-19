const STORAGE_KEY = "headbands:sound-muted";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
  }
  return ctx;
}

/** Browsers block audio until a user gesture. Call once on the first click/keypress anywhere. */
export function unlockAudio(): void {
  const c = getContext();
  if (c?.state === "suspended") {
    c.resume().catch(() => {});
  }
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Storage unavailable - the setting just won't persist across visits.
  }
}

function tone(freq: number, startOffset: number, duration: number, peakGain: number, type: OscillatorType = "sine"): void {
  const c = getContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function play(build: () => void): void {
  if (isSoundMuted()) return;
  build();
}

/** Someone else joins your lobby: a single soft blip. */
export function playJoin(): void {
  play(() => tone(660, 0, 0.09, 0.025));
}

/** A round is dealt: a short rising three-note flourish, like cards being fanned out. */
export function playRoundStart(): void {
  play(() => {
    tone(392, 0, 0.08, 0.035);
    tone(523.25, 0.06, 0.08, 0.035);
    tone(659.25, 0.12, 0.14, 0.04);
  });
}

/** You reveal your own card: a bright confirming two-note chime. */
export function playReveal(): void {
  play(() => {
    tone(523.25, 0, 0.14, 0.045);
    tone(783.99, 0.09, 0.18, 0.045);
  });
}

/** A round ends but the game continues: a small, quieter version of the game-over chime. */
export function playRoundComplete(): void {
  play(() => {
    tone(523.25, 0, 0.1, 0.03);
    tone(659.25, 0.08, 0.14, 0.03);
  });
}

/** The whole game ends: a short three-note fanfare. */
export function playGameOver(): void {
  play(() => {
    tone(523.25, 0, 0.14, 0.045);
    tone(659.25, 0.12, 0.14, 0.045);
    tone(783.99, 0.24, 0.22, 0.05);
  });
}
