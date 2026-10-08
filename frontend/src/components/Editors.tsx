import { useState, type FormEvent } from "react";
import { request, save } from "../lib/api";
import type {
  Membership,
  Organization,
  Project,
  Task,
  TaskStatus,
} from "../lib/types";
import { statuses } from "../lib/types";
import { Dialog } from "./Dialog";
import { ErrorNotice, Field, SubmitButton } from "./Form";

export type Editor =
  | { kind: "organization"; item?: Organization }
  | { kind: "project"; item?: Project }
  | { kind: "task"; item?: Task; status?: TaskStatus }
  | { kind: "member" }
  | {
      kind: "delete";
      resource: "organizations" | "projects" | "tasks" | "memberships";
      id: number;
      name: string;
    };
interface EditorProps {
  editor: Editor;
  organization?: Organization;
  project?: Project;
  members: Membership[];
  onClose: () => void;
  onSaved: (resource?: string, id?: number) => Promise<void>;
}

export function EditorDialog({
  editor,
  organization,
  project,
  members,
  onClose,
  onSaved,
}: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const item = "item" in editor ? editor.item : undefined;
  const title =
    editor.kind === "delete"
      ? "Delete this item?"
      : editor.kind === "member"
        ? "Add a team member"
        : `${item ? "Edit" : "New"} ${editor.kind === "organization" ? "team" : editor.kind}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (editor.kind === "delete") {
        await request(`/${editor.resource}/${editor.id}/`, {
          method: "DELETE",
        });
        await onSaved();
        onClose();
        return;
      }
      let resource: string;
      let payload: Record<string, unknown>;
      switch (editor.kind) {
        case "organization":
          resource = "organizations";
          payload = { name: String(values.get("name")).trim() };
          break;
        case "project":
          resource = "projects";
          payload = {
            name: String(values.get("name")).trim(),
            description: values.get("description"),
            ...(!item ? { organization: organization!.id } : {}),
          };
          break;
        case "member":
          resource = "memberships";
          payload = {
            user: Number(values.get("user")),
            organization: organization!.id,
            role: values.get("role"),
          };
          break;
        case "task": {
          const date = String(values.get("due_date") || "");
          resource = "tasks";
          payload = {
            title: String(values.get("title")).trim(),
            description: values.get("description"),
            assigned_to: values.get("assigned_to")
              ? Number(values.get("assigned_to"))
              : null,
            status: values.get("status"),
            due_date: date ? new Date(date).toISOString() : null,
            ...(!item ? { project: project!.id } : {}),
          };
          break;
        }
      }
      const result = await save<{ id: number }>(
        `/${resource}/${item ? `${item.id}/` : ""}`,
        payload,
        item ? "PATCH" : "POST",
      );
      await onSaved(item ? undefined : resource, result.id);
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const task = editor.kind === "task" ? editor.item : undefined;
  let localDate = "";
  if (task?.due_date) {
    const date = new Date(task.due_date);
    localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <ErrorNotice error={error} />
        <fieldset disabled={busy}>
          {editor.kind === "delete" ? (
            <p className="delete-description">
              Delete <strong>{editor.name}</strong>?{" "}
              {editor.resource === "organizations"
                ? "Its projects, tasks, and memberships will also be deleted."
                : editor.resource === "projects"
                  ? "All tasks in this project will also be deleted."
                  : editor.resource === "memberships"
                    ? "This person will lose access to the team and their task assignments will be cleared."
                    : "This task will be permanently removed."}
            </p>
          ) : (
            <>
              {(editor.kind === "organization" ||
                editor.kind === "project") && (
                <Field label="Name" name="name" error={error}>
                  <input
                    id="name"
                    name="name"
                    defaultValue={item && "name" in item ? item.name : ""}
                    required
                    maxLength={100}
                    autoFocus
                    aria-describedby="name-error"
                  />
                </Field>
              )}
              {editor.kind === "task" && (
                <Field label="Task title" name="title" error={error}>
                  <input
                    id="title"
                    name="title"
                    defaultValue={task?.title}
                    required
                    maxLength={200}
                    autoFocus
                    aria-describedby="title-error"
                  />
                </Field>
              )}
              {(editor.kind === "project" || editor.kind === "task") && (
                <Field
                  label="Description (optional)"
                  name="description"
                  error={error}
                >
                  <textarea
                    id="description"
                    name="description"
                    defaultValue={
                      item && "description" in item ? item.description : ""
                    }
                    rows={3}
                  />
                </Field>
              )}
              {editor.kind === "member" && (
                <>
                  <p className="form-hint">
                    Ask your teammate for the member ID shown beside their
                    profile in TeamSync. They need to create an account first.
                  </p>
                  <Field label="Member ID" name="user" error={error}>
                    <input
                      id="user"
                      name="user"
                      type="number"
                      min={1}
                      step={1}
                      required
                      autoFocus
                      aria-describedby="user-error"
                    />
                  </Field>
                  <Field label="Role" name="role" error={error}>
                    <select id="role" name="role" defaultValue="MEMBER">
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </Field>
                </>
              )}
              {editor.kind === "task" && (
                <>
                  <div className="form-row">
                    <Field label="Status" name="status" error={error}>
                      <select
                        id="status"
                        name="status"
                        defaultValue={
                          task?.status ||
                          (editor.kind === "task"
                            ? editor.status
                            : undefined) ||
                          "TODO"
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Assignee" name="assigned_to" error={error}>
                      <select
                        id="assigned_to"
                        name="assigned_to"
                        defaultValue={task?.assigned_to || ""}
                        aria-describedby="assigned_to-error"
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.user}>
                            {member.username}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="Due date (optional)"
                    name="due_date"
                    error={error}
                  >
                    <input
                      id="due_date"
                      name="due_date"
                      type="datetime-local"
                      defaultValue={localDate}
                      aria-describedby="due_date-error"
                    />
                  </Field>
                </>
              )}
            </>
          )}
        </fieldset>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {editor.kind === "delete" ? (
            <button className="button danger" type="submit" disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <SubmitButton busy={busy}>
              {item
                ? "Save changes"
                : editor.kind === "member"
                  ? "Add member"
                  : editor.kind === "organization"
                    ? "Create team"
                    : editor.kind === "project"
                      ? "Create project"
                      : "Create task"}
            </SubmitButton>
          )}
        </div>
      </form>
    </Dialog>
  );
}
