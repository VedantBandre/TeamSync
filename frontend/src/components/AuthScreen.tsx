import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Layers3 } from "lucide-react";
import { login, request } from "../lib/api";
import type { User } from "../lib/types";
import { ErrorNotice, Field, SubmitButton } from "./Form";

export function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  useEffect(() => {
    document.title = "Sign in · TeamSync";
  }, []);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [registered, setRegistered] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const username = String(form.get("username")).trim();
      const password = String(form.get("password"));
      if (register) {
        await request(
          "/register/",
          {
            method: "POST",
            body: JSON.stringify({
              username,
              password,
              email: String(form.get("email") || "").trim(),
            }),
          },
          false,
        );
        setRegister(false);
        setRegistered(true);
        return;
      }
      await login(username, password);
      onLogin(await request<User>("/me/"));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          TeamSync
        </a>
        <div className="auth-story-content">
          <p className="eyebrow">GOOD WORK STARTS TOGETHER</p>
          <h1>
            A little less chaos.
            <br />
            <em>A lot more progress.</em>
          </h1>
          <p>
            Bring your people, projects, and next steps into one shared
            workspace.
          </p>
          <div className="story-board" aria-hidden="true">
            <div className="story-board-top">
              <span className="mini-dot" />
              Your team's next chapter <span>•••</span>
            </div>
            <div className="story-columns">
              <div>
                <small>TO DO</small>
                <div className="story-task">
                  Find the next big idea
                  <span className="tiny-line" />
                </div>
              </div>
              <div>
                <small>IN PROGRESS</small>
                <div className="story-task">
                  Make something great
                  <span className="tiny-line" />
                </div>
              </div>
              <div>
                <small>DONE</small>
                <div className="story-task finished">
                  <Check size={15} /> Take the first step
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="auth-footnote">A shared plan. A clear next step.</p>
      </section>
      <section className="auth-form-section">
        <div className="auth-form-card">
          <span className="small-label">
            YOUR WORKSPACE, READY WHEN YOU ARE
          </span>
          <h2>{register ? "Start working together." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create your account, then bring your team along."
              : "Sign in and pick up where your team left off."}
          </p>
          {registered && (
            <p role="status" className="success-notice">
              Your account is ready. Sign in to create or join a team.
            </p>
          )}
          <form
            onSubmit={submit}
            aria-label={register ? "Create account" : "Sign in"}
          >
            <ErrorNotice error={error} />
            <Field label="Username" name="username" error={error}>
              <input
                id="username"
                name="username"
                required
                maxLength={150}
                autoComplete="username"
                autoFocus
                disabled={busy}
                aria-describedby="username-error"
              />
            </Field>
            {register && (
              <Field label="Email (optional)" name="email" error={error}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  disabled={busy}
                  aria-describedby="email-error"
                />
              </Field>
            )}
            <Field label="Password" name="password" error={error}>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete={register ? "new-password" : "current-password"}
                disabled={busy}
                aria-describedby="password-error"
              />
            </Field>
            {register && (
              <p className="form-hint">
                Use at least 8 characters. Avoid common passwords and your
                username.
              </p>
            )}
            <SubmitButton busy={busy}>
              {register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </SubmitButton>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to TeamSync?"}{" "}
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError(null);
                setRegistered(false);
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
