import { useState } from "react";
import type { User } from "../lib/types";
import { clearSession, request, save } from "../lib/api";
import { Dialog } from "./Dialog";
import { ErrorNotice, Field } from "./Form";

interface DeletionCheck {
  can_delete: boolean;
  blocked_teams: { id: number; name: string }[];
}
export function DeleteAccount({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function inspect() {
    setBusy(true);
    setCheck(null);
    setError(null);
    try {
      setCheck(await request<DeletionCheck>("/account/deletion/"));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="account-card account-danger"
      aria-labelledby="delete-account-heading"
    >
      <h2 id="delete-account-heading">Delete account</h2>
      <p className="muted">
        Permanently remove your profile and sign out every session. Shared team
        work stays with the team.
      </p>
      <button
        className="button danger"
        onClick={() => {
          setOpen(true);
          void inspect();
        }}
      >
        Delete my account
      </button>
      {open && (
        <Dialog
          title="Delete your account?"
          busy={busy}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            This cannot be undone. Your profile photo, recovery email and login
            sessions will be removed. Shared tasks and comments remain,
            attributed to “Deleted member”. Teams you created transfer to
            another admin.
          </p>
          <ErrorNotice error={error} />
          {busy && !check && <p role="status">Checking your teams…</p>}
          {check && !check.can_delete && (
            <div className="deletion-blockers" role="status">
              <p>
                You are the only admin for these teams. Promote another admin,
                or explicitly delete each team first:
              </p>
              <ul>
                {check.blocked_teams.map((team) => (
                  <li key={team.id}>
                    <a href={`/?team=${team.id}&view=members`}>{team.name}</a>
                  </li>
                ))}
              </ul>
              <button
                className="button secondary"
                onClick={() => void inspect()}
                disabled={busy}
              >
                Check again
              </button>
            </div>
          )}
          {!check && !busy && (
            <button className="text-button" onClick={() => void inspect()}>
              Try checking again
            </button>
          )}
          {check?.can_delete && (
            <form
              aria-label="Delete account"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setBusy(true);
                setError(null);
                try {
                  await save("/account/deletion/", {
                    current_password: form.get("deletion_password"),
                    confirm_username: form.get("confirm_username"),
                  });
                  window.history.replaceState(null, "", "/");
                  clearSession();
                } catch (failure) {
                  setError(failure);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <Field
                  label="Current password to delete account"
                  name="deletion_password"
                >
                  <input
                    id="deletion_password"
                    name="deletion_password"
                    type="password"
                    maxLength={256}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field
                  label={`Type ${user.username} to confirm`}
                  name="confirm_username"
                  error={error}
                >
                  <input
                    id="confirm_username"
                    name="confirm_username"
                    maxLength={150}
                    autoComplete="off"
                    required
                    pattern={user.username.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&",
                    )}
                  />
                </Field>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button danger"
                    disabled={busy}
                  >
                    {busy ? "Deleting…" : "Permanently delete account"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </Dialog>
      )}
    </section>
  );
}
