import { useSoundMuted } from "../state/useSoundMuted";

export function SoundToggle() {
  const { muted, toggle } = useSoundMuted();

  return (
    <button
      type="button"
      className="icon-toggle"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
      title={muted ? "Sound off" : "Sound on"}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        {!muted && (
          <>
            <path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M18.6 5.5a9 9 0 0 1 0 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}
        {muted && (
          <path d="M16 9l5.5 6M21.5 9L16 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
