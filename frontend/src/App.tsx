import { useEffect, useState } from "react";
import { Layers3, LoaderCircle } from "lucide-react";
import { clearSession, hasSession, request } from "./lib/api";
import type { User } from "./lib/types";
import { AuthScreen } from "./components/AuthScreen";
import { ErrorNotice } from "./components/Form";
import { Workspace } from "./components/Workspace";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(hasSession);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const signedOut = () => {
      setUser(null);
      setRestoring(false);
      setError(null);
    };
    window.addEventListener("teamsync:signed-out", signedOut);
    return () => window.removeEventListener("teamsync:signed-out", signedOut);
  }, []);
  useEffect(() => {
    if (!hasSession()) return;
    let active = true;
    request<User>("/me/")
      .then((result) => {
        if (active) setUser(result);
      })
      .catch((failure) => {
        if (active && hasSession()) setError(failure);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (restoring || error)
    return (
      <main className="connection-screen">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          TeamSync
        </div>
        {restoring ? (
          <p>
            <LoaderCircle className="spin" size={20} /> Opening your workspace…
          </p>
        ) : (
          <>
            <ErrorNotice error={error} />
            <button
              className="button primary"
              onClick={() => {
                setError(null);
                setRestoring(true);
                setAttempt(attempt + 1);
              }}
            >
              Try again
            </button>
            <button className="text-button" onClick={clearSession}>
              Back to sign in
            </button>
          </>
        )}
      </main>
    );
  return user ? (
    <Workspace user={user} onLogout={clearSession} />
  ) : (
    <AuthScreen
      onLogin={(value) => {
        setError(null);
        setUser(value);
      }}
    />
  );
}
