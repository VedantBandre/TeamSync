import { useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import type { User } from "../lib/types";
import { save } from "../lib/api";
import { AccountSecurity } from "./AccountSecurity";
import { ErrorNotice, SubmitButton } from "./Form";

export function Account({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.display_name || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [status, setStatus] = useState(user.status || "");
  const [emoji, setEmoji] = useState(user.status_emoji || "");
  const [avatar, setAvatar] = useState<string | null>(user.avatar || null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const photoVersion = useRef(0);
  const changed = () => setSaved(false);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            <UserRound size={14} /> YOUR SPACE
          </p>
          <h1>My Account.</h1>
          <p className="muted">
            A familiar face. A name your team knows. What you’re up to.
          </p>
        </div>
      </section>
      <form
        className="account-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setSaved(false);
          setError(null);
          try {
            const result = await save<User>(
              "/me/",
              {
                display_name: name,
                nickname,
                status,
                status_emoji: emoji,
                avatar,
              },
              "PATCH",
            );
            onSaved(result);
            setName(result.display_name || "");
            setNickname(result.nickname || "");
            setStatus(result.status || "");
            setEmoji(result.status_emoji || "");
            setAvatar(result.avatar || null);
            setSaved(true);
          } catch (failure) {
            setError(failure);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorNotice error={error} />
        {saved && (
          <p className="account-saved" role="status">
            Your profile is saved.
          </p>
        )}
        <fieldset disabled={busy || reading}>
          <div className="account-photo-row">
            <span className="avatar account-avatar">
              {avatar ? (
                <img src={avatar} alt="Profile photo preview" />
              ) : (
                (name || user.username).slice(0, 2).toUpperCase()
              )}
            </span>
            <div>
              <label className="photo-label" htmlFor="profile-photo">
                <Camera size={16} /> Profile photo
              </label>
              <input
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const version = ++photoVersion.current;
                  changed();
                  setError(null);
                  if (
                    file.size > 2 * 1024 * 1024 ||
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    )
                  ) {
                    setError(
                      new Error(
                        "Choose a JPEG, PNG, or WebP photo under 2 MB.",
                      ),
                    );
                    return;
                  }
                  setReading(true);
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (version === photoVersion.current) {
                      setAvatar(String(reader.result));
                      setReading(false);
                    }
                  };
                  reader.onerror = () => {
                    if (version === photoVersion.current) {
                      setError(new Error("Could not read this photo."));
                      setReading(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <p className="muted">
                JPEG, PNG or WebP · up to 2 MB. Cropped to a square.
              </p>
              {avatar && (
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => {
                    photoVersion.current++;
                    setAvatar(null);
                    changed();
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <div className="account-fields">
            <div className="field">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                value={name}
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value);
                  changed();
                }}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                value={nickname}
                maxLength={40}
                onChange={(e) => {
                  setNickname(e.target.value);
                  changed();
                }}
                placeholder="What friends call you"
                autoComplete="nickname"
              />
            </div>
          </div>
          <div className="account-section">
            <h2>Set your status</h2>
            <p className="muted">
              Visible to teammates. This stays until you change or clear it.
            </p>
            <div className="status-presets">
              {[
                ["💻", "Focusing"],
                ["🌴", "Away"],
                ["💬", "Available"],
              ].map(([icon, text]) => (
                <button
                  className="button secondary"
                  key={text}
                  type="button"
                  onClick={() => {
                    setEmoji(icon);
                    setStatus(text);
                    changed();
                  }}
                >
                  {icon} {text}
                </button>
              ))}
            </div>
            <div className="account-fields status-fields">
              <div className="field">
                <label htmlFor="status-emoji">Status emoji</label>
                <input
                  id="status-emoji"
                  value={emoji}
                  maxLength={16}
                  onChange={(e) => {
                    setEmoji(e.target.value);
                    changed();
                  }}
                  placeholder="💬"
                />
              </div>
              <div className="field">
                <label htmlFor="profile-status">Status</label>
                <input
                  id="profile-status"
                  value={status}
                  maxLength={120}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    changed();
                  }}
                  placeholder="What’s happening?"
                />
              </div>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEmoji("");
                setStatus("");
                changed();
              }}
            >
              Clear status
            </button>
          </div>
          <div className="account-section account-details">
            <h2>Account details</h2>
            <p>
              Username <strong>{user.username}</strong>
            </p>
            <p>
              Member ID <strong>{user.id}</strong>
            </p>
            {user.email && (
              <p>
                Email <strong>{user.email}</strong>
              </p>
            )}
          </div>
        </fieldset>
        <div className="dialog-actions">
          <SubmitButton busy={busy} disabled={reading}>
            Save profile
          </SubmitButton>
        </div>
      </form>
      <AccountSecurity user={user} />
    </>
  );
}
