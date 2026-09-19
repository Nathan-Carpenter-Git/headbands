import { useCallback, useState } from "react";
import { isSoundMuted, setSoundMuted } from "../lib/sound";

export function useSoundMuted() {
  const [muted, setMuted] = useState(() => isSoundMuted());

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setSoundMuted(next);
      return next;
    });
  }, []);

  return { muted, toggle };
}
