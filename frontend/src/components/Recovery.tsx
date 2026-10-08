import { useEffect, useState } from "react";
import { clearSession, request } from "../lib/api";
import { ErrorNotice, Field, SubmitButton } from "./Form";

export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  return (
    <>
      <h2>Reset your password.</h2>
      <p className="muted">
        Enter the recovery email you verified in My Account.
      </p>
      {sent ? (
        <p role="status" className="success-notice">
          If this is a verified recovery email, a reset link will arrive
          shortly. Check your spam folder too.
        </p>
      ) : (
        <form
          aria-label="Request password reset"
          onSubmit={async (event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get("reset_email");
            setBusy(true);
            setError(null);
            try {
              await request(
                "/password/reset/request/",
                { method: "POST", body: JSON.stringify({ email }) },
                false,
              );
              setSent(true);
            } catch (failure) {
              setError(failure);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorNotice error={error} />
          <Field label="Recovery email" name="reset_email" error={error}>
            <input
              id="reset_email"
              name="reset_email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              autoFocus
            />
          </Field>
          <SubmitButton busy={busy}>Send reset link</SubmitButton>
        </form>
      )}
      <p className="auth-switch">
        <button className="text-button" disabled={busy} onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </>
  );
}

export interface RecoveryLink {
  action: string;
  token: string;
  uid: string;
}

export function RecoveryConfirmation({
  link,
  onClose,
}: {
  link: RecoveryLink;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const reset = link.action === "reset";
  useEffect(() => {
    document.title = `${reset ? "Reset password" : "Verify email"} · TeamSync`;
  }, [reset]);
  return (
    <main className="auth-page recovery-page">
      <section className="auth-form-section">
        <div className="auth-form-card">
          <p className="eyebrow">TEAMSYNC</p>
          <h1>
            {reset ? "Choose a new password." : "Verify your recovery email."}
          </h1>
          <p className="muted">
            {reset
              ? "This signs out every existing session."
              : "Confirm that you requested this email verification."}
          </p>
          {done ? (
            <p role="status" className="success-notice">
              {reset
                ? "Password updated. Sign in with your new password."
                : "Your recovery email is verified."}
            </p>
          ) : (
            <form
              aria-label={reset ? "Reset password" : "Verify email"}
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setBusy(true);
                setError(null);
                try {
                  await request(
                    reset
                      ? "/password/reset/confirm/"
                      : "/email/verify/confirm/",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        token: link.token,
                        ...(reset
                          ? {
                              uid: link.uid,
                              new_password: form.get("reset_password"),
                              confirm_password: form.get("reset_confirm"),
                            }
                          : {}),
                      }),
                    },
                    false,
                  );
                  if (reset) clearSession();
                  setDone(true);
                } catch (failure) {
                  setError(failure);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ErrorNotice error={error} />
              {reset &&
                [
                  ["New password", "reset_password"],
                  ["Confirm new password", "reset_confirm"],
                ].map(([label, name]) => (
                  <Field key={name} label={label} name={name} error={error}>
                    <input
                      id={name}
                      name={name}
                      type="password"
                      required
                      maxLength={256}
                      autoComplete="new-password"
                      disabled={busy}
                    />
                  </Field>
                ))}
              <SubmitButton busy={busy}>
                {reset ? "Reset password" : "Verify email"}
              </SubmitButton>
            </form>
          )}
          <p className="auth-switch">
            <button className="text-button" disabled={busy} onClick={onClose}>
              Continue to TeamSync
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
