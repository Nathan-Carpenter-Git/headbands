import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { LobbyProvider } from "./state/LobbyContext.tsx";
import { unlockAudio } from "./lib/sound.ts";

// Browsers block audio playback until a user gesture. Unlock once on the first
// interaction anywhere, so a sound triggered later by an incoming WebSocket
// message (e.g. someone else joining) isn't silently dropped.
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("keydown", unlockAudio, { once: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LobbyProvider>
        <App />
      </LobbyProvider>
    </BrowserRouter>
  </StrictMode>,
);
