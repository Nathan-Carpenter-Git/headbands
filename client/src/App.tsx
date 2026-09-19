import { Link, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Lobby } from "./pages/Lobby";
import { Categories } from "./pages/Categories";
import { useLobby } from "./state/useLobby";

function App() {
  const { errorMessage, dismissError, connected, lobby, leaveLobby } = useLobby();

  return (
    <>
      <header className="app-header">
        <Link
          to="/"
          className="brand"
          onClick={() => {
            if (lobby) leaveLobby();
          }}
        >
          <span className="brand-mark" />
          <span className="brand-name">Headbands</span>
        </Link>
      </header>

      <div className="banner-stack">
        {!connected && (
          <div className="banner" role="status">
            Connecting to server…
          </div>
        )}
        {errorMessage && (
          <div className="banner banner-error" role="alert">
            <span>{errorMessage}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissError}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/lobby/:code" element={<Lobby />} />
      </Routes>

      <footer className="app-footer">
        <a href="https://www.linkedin.com/in/nathan-b-carpenter/" target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a href="https://www.nathan-carpenter.org" target="_blank" rel="noreferrer">
          Website
        </a>
        <a href="https://github.com/Nathan-Carpenter-Git/headbands" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </>
  );
}

export default App;
