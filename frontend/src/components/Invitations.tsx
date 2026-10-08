import { useEffect, useState } from "react";
import { Link, UserPlus } from "lucide-react";
import { ApiError, request, save } from "../lib/api";
import type {
  Invitation,
  InvitationPreview,
  Organization,
  Page,
  User,
} from "../lib/types";
import { navigateWorkspace, workspaceLink } from "../lib/navigation";
import { ErrorNotice } from "./Form";

export function InvitationManager({
  organization,
}: {
  organization: Organization;
}) {
  const [data, setData] = useState<Page<Invitation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [link, setLink] = useState<{ id: number; url: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<number | null>(null);
  const path = `/invitations/?organization=${organization.id}`;
  useEffect(() => {
    let active = true;
    request<Page<Invitation>>(path)
      .then((rows) => {
        if (active) setData(rows);
      })
      .catch((failure) => {
        if (active) setError(failure);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function refresh(page = "1") {
    setLoading(true);
    setError(null);
    try {
      setData(
        await request<Page<Invitation>>(
          `${path}&page=${encodeURIComponent(page)}`,
        ),
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }
  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const invitation = await save<Invitation & { token: string }>(
        "/invitations/",
        { organization: organization.id },
      );
      const url = new URL("/", window.location.origin);
      url.searchParams.set("invite", invitation.token);
      setLink({ id: invitation.id, url: url.href });
      setNotice("Invitation ready. Copy the link before leaving this page.");
      setData(
        (current) =>
          current && {
            ...current,
            count: current.count + 1,
            results: [invitation, ...current.results],
          },
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: number) {
    setBusy(true);
    setError(null);
    try {
      const invitation = await save<Invitation>(
        `/invitations/${id}/revoke/`,
        {},
      );
      setData(
        (current) =>
          current && {
            ...current,
            results: current.results.map((item) =>
              item.id === id ? invitation : item,
            ),
          },
      );
      if (link?.id === id) setLink(null);
      setConfirm(null);
      setNotice("Invitation revoked.");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setNotice("Invitation link copied.");
    } catch {
      setNotice("Select the invitation link below and copy it manually.");
    }
  }
  return (
    <section
      className="invitations-panel"
      aria-labelledby="invitations-heading"
    >
      <div className="panel-heading">
        <h2 id="invitations-heading">
          <UserPlus size={18} /> Invite teammates
        </h2>
        <button
          className="button secondary"
          onClick={() => void create()}
          disabled={busy || loading || !data}
        >
          <Link size={16} />
          Create invitation
        </button>
      </div>
      <p className="form-hint">
        Each link lets one person join as a member and expires in 7 days. Share
        it with the person you want to invite.
      </p>
      <ErrorNotice error={error} />
      {notice && (
        <p className="invite-notice" role="status">
          {notice}
        </p>
      )}
      {link && (
        <div className="invite-link">
          <label htmlFor="invitation-link">Invitation link</label>
          <input
            id="invitation-link"
            readOnly
            value={link.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="button secondary" onClick={() => void copy()}>
            Copy invitation link
          </button>
        </div>
      )}
      {loading && <p className="form-hint">Loading invitations…</p>}
      <button
        className="text-button"
        disabled={busy || loading}
        onClick={() => void refresh()}
      >
        Refresh invitations
      </button>
      {data?.count === 0 && <p className="form-hint">No invitations yet.</p>}
      <ul className="invitation-list">
        {data?.results.map((invitation) => (
          <li key={invitation.id}>
            <div>
              <strong>Invitation #{invitation.id}</strong>
              <span
                className={`invite-state state-${invitation.state.toLowerCase()}`}
              >
                {invitation.state.toLowerCase()}
              </span>
              <p>
                {invitation.state === "ACTIVE" ? "Expires" : "Created"}{" "}
                <time
                  dateTime={
                    invitation.state === "ACTIVE"
                      ? invitation.expires_at
                      : invitation.created_at
                  }
                >
                  {new Date(
                    invitation.state === "ACTIVE"
                      ? invitation.expires_at
                      : invitation.created_at,
                  ).toLocaleString()}
                </time>
              </p>
            </div>
            {invitation.state === "ACTIVE" && (
              <div className="comment-actions">
                {confirm === invitation.id ? (
                  <>
                    <span>Revoke this link?</span>
                    <button
                      className="text-button danger-text"
                      onClick={() => void revoke(invitation.id)}
                      disabled={busy}
                    >
                      Confirm revoke
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setConfirm(null)}
                      disabled={busy}
                    >
                      Keep invitation
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button"
                    aria-label={`Revoke invitation ${invitation.id}`}
                    onClick={() => setConfirm(invitation.id)}
                    disabled={busy || loading}
                  >
                    Revoke
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {data?.next && (
        <button
          className="text-button"
          disabled={busy || loading}
          onClick={() =>
            void refresh(
              new URL(data.next!, window.location.origin).searchParams.get(
                "page",
              ) || "1",
            )
          }
        >
          Older invitations
        </button>
      )}
    </section>
  );
}

export function AcceptInvitation({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: User;
  onLogout: () => void;
}) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.title = "Team invitation · TeamSync";
    let active = true;
    save<InvitationPreview>("/invitations/preview/", { token })
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((failure) => {
        if (active) setError(failure);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  async function join() {
    setBusy(true);
    setError(null);
    try {
      const result = await save<InvitationPreview>("/invitations/accept/", {
        token,
      });
      navigateWorkspace(
        workspaceLink(result.organization, null, "members"),
        true,
      );
    } catch (failure) {
      if (failure instanceof ApiError && [404, 410].includes(failure.status))
        setPreview(null);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="connection-screen">
      <div className="invitation-card">
        <div className="brand">
          <UserPlus size={25} /> TeamSync
        </div>
        <p className="eyebrow">TEAM INVITATION</p>
        <h1>{preview ? `${preview.organization_name}` : "Join your team"}</h1>
        <p className="form-hint">
          Signed in as <strong>{user.username}</strong>.
        </p>
        <ErrorNotice error={error} />
        {loading ? (
          <p role="status">Opening invitation…</p>
        ) : preview ? (
          <>
            <p>
              {preview.already_member
                ? "You already belong to this team."
                : "You’re invited to join as a member. You’ll be able to work on the team’s projects and tasks."}
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void join()}
            >
              {busy
                ? "Joining…"
                : preview.already_member
                  ? "Open team"
                  : "Join team"}
            </button>
          </>
        ) : (
          <button
            className="button secondary"
            onClick={() => {
              setError(null);
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        )}
        <div className="invitation-footer">
          <button className="text-button" disabled={busy} onClick={onLogout}>
            Use another account
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => navigateWorkspace("/", true)}
          >
            Go to my workspace
          </button>
        </div>
      </div>
    </main>
  );
}
