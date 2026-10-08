import { useState } from "react";
import { save } from "../lib/api";
import type { Project } from "../lib/types";
import { Dialog } from "./Dialog";
import { ErrorNotice, SubmitButton } from "./Form";

export function ArchiveProjectDialog({
  project,
  restore,
  onSaved,
  onClose,
}: {
  project: Project;
  restore: boolean;
  onSaved: (project: Project) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      title={restore ? "Restore this project?" : "Archive this project?"}
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const saved = await save<Project>(
              `/projects/${project.id}/${restore ? "restore" : "archive"}/`,
              {},
            );
            onSaved(saved);
            onClose();
          } catch (failure) {
            setError(failure);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorNotice error={error} />
        <p className="delete-description">
          <strong>{project.name}</strong>
          {restore
            ? " will return to the active project list. Your team can edit its tasks and comments again."
            : " will move to Archived projects. Tasks, comments, and history will be kept, and the project will become read-only. An admin can restore it later."}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <SubmitButton busy={busy}>
            {restore ? "Restore project" : "Archive project"}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
