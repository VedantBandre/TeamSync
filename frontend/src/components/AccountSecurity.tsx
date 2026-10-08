import { useState } from "react";
import type { User } from "../lib/types";
import { clearSession, save } from "../lib/api";
import { ErrorNotice, Field, SubmitButton } from "./Form";

export function AccountSecurity({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  return (
    <section className="account-card" aria-labelledby="security-heading">
      <h2 id="security-heading">Security and recovery</h2>
      <p className="muted">
        {user.email_verified
          ? `Verified recovery email: ${user.email}`
          : "Add and verify a recovery email so you can reset a forgotten password."}
      </p>
      <ErrorNotice error={error} />
      {notice && (
        <p role="status" className="success-notice">
          {notice}
        </p>
      )}
      <form
        aria-label="Verify recovery email"
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const form = new FormData(element);
          setBusy(true);
          setError(null);
          setNotice("");
          try {
            await save("/email/verify/request/", {
              email: form.get("recovery_email"),
              password: form.get("verify_password"),
            });
            setNotice(
              "Check your inbox and confirm the verification link. It expires in one hour.",
            );
            element.reset();
          } catch (failure) {
            setError(failure);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <Field label="Recovery email" name="recovery_email" error={error}>
            <input
              id="recovery_email"
              name="recovery_email"
              type="email"
              required
              autoComplete="email"
              defaultValue={user.email}
            />
          </Field>
          <Field
            label="Password to verify email"
            name="verify_password"
            error={error}
          >
            <input
              id="verify_password"
              name="verify_password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={256}
            />
          </Field>
          <SubmitButton busy={busy}>Send verification email</SubmitButton>
        </fieldset>
      </form>
      <form
        className="account-section"
        aria-label="Change password"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError(null);
          setNotice("");
          try {
            await save("/password/change/", {
              current_password: form.get("current_password"),
              new_password: form.get("new_password"),
              confirm_password: form.get("confirm_password"),
            });
            clearSession();
          } catch (failure) {
            setError(failure);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Change password</h3>
        <p className="muted">
          Changing your password signs you out on every device.
        </p>
        <fieldset disabled={busy}>
          {[
            ["Current password", "current_password"],
            ["New password", "new_password"],
            ["Confirm new password", "confirm_password"],
          ].map(([label, name]) => (
            <Field key={name} label={label} name={name} error={error}>
              <input
                id={name}
                name={name}
                type="password"
                required
                maxLength={256}
                autoComplete={
                  name === "current_password"
                    ? "current-password"
                    : "new-password"
                }
              />
            </Field>
          ))}
          <SubmitButton busy={busy}>Change password and sign out</SubmitButton>
        </fieldset>
      </form>
    </section>
  );
}
