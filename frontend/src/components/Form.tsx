import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { ApiError } from "../lib/api";

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const text =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{text}</span>
    </div>
  );
}
export function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: unknown;
  children: ReactNode;
}) {
  const message = error instanceof ApiError ? error.fields[name] : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {message && (
        <p className="field-error" id={`${name}-error`}>
          {message}
        </p>
      )}
    </div>
  );
}
export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy && <LoaderCircle size={16} className="spin" />}
      {busy ? "Saving…" : children}
    </button>
  );
}
