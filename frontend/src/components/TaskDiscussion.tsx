import { useEffect, useState, type FormEvent } from "react";
import { request, save } from "../lib/api";
import type { Page, Task, TaskActivity, TaskComment, User } from "../lib/types";
import { priorities, statuses } from "../lib/types";
import { Dialog } from "./Dialog";
import { ErrorNotice, SubmitButton } from "./Form";

const labels: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  assigned_to: "Assignee",
  due_date: "Due date",
};
const events = {
  CREATED: "created the task",
  UPDATED: "updated the task",
  COMMENT_ADDED: "added a comment",
  COMMENT_EDITED: "edited a comment",
  COMMENT_DELETED: "deleted a comment",
};
function display(field: string, value: string | null) {
  if (value === null || value === "") return "None";
  if (field === "status")
    return statuses.find((item) => item.value === value)?.label || value;
  if (field === "priority")
    return priorities.find((item) => item.value === value)?.label || value;
  if (field === "due_date") return new Date(value).toLocaleString();
  return value;
}
function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}
function nextPage(next: string) {
  return new URL(next, window.location.origin).searchParams.get("page") || "1";
}
function appendPage<T extends { id: number }>(
  previous: Page<T> | null,
  page: Page<T>,
): Page<T> {
  const items = new Map(previous?.results.map((item) => [item.id, item]));
  page.results.forEach((item) => items.set(item.id, item));
  return { ...page, results: [...items.values()] };
}

export function TaskDiscussion({
  task,
  readOnly = false,
  user,
  onClose,
}: {
  task: Task;
  readOnly?: boolean;
  user: User;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Page<TaskComment> | null>(null);
  const [activity, setActivity] = useState<Page<TaskActivity> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const base = `/tasks/${task.id}`;
  useEffect(() => {
    let active = true;
    Promise.all([
      request<Page<TaskComment>>(`${base}/comments/`),
      request<Page<TaskActivity>>(`${base}/activity/`),
    ])
      .then(([rows, history]) => {
        if (active) {
          setComments(rows);
          setActivity(history);
        }
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
  }, [base]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [rows, history] = await Promise.all([
        request<Page<TaskComment>>(`${base}/comments/`),
        request<Page<TaskActivity>>(`${base}/activity/`),
      ]);
      setComments(rows);
      setActivity(history);
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }
  async function loadMore(kind: "comments" | "activity", next: string) {
    setLoading(true);
    setError(null);
    try {
      if (kind === "comments") {
        const page = await request<Page<TaskComment>>(
          `${base}/comments/?page=${encodeURIComponent(nextPage(next))}`,
        );
        setComments((current) => appendPage(current, page));
      } else {
        const page = await request<Page<TaskActivity>>(
          `${base}/activity/?page=${encodeURIComponent(nextPage(next))}`,
        );
        setActivity((current) => appendPage(current, page));
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }
  async function mutate(action: "add" | "edit" | "delete", id?: number) {
    if (busy || loading || readOnly) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      if (action === "delete") {
        await request(`${base}/comments/${id}/`, { method: "DELETE" });
        setComments(
          (current) =>
            current && {
              ...current,
              count: current.count - 1,
              results: current.results.filter((comment) => comment.id !== id),
            },
        );
        setDeleting(null);
      } else {
        const comment = await save<TaskComment>(
          action === "add" ? `${base}/comments/` : `${base}/comments/${id}/`,
          { body: action === "add" ? body.trim() : editBody.trim() },
          action === "add" ? "POST" : "PATCH",
        );
        setComments(
          (current) =>
            current && {
              ...current,
              count: current.count + (action === "add" ? 1 : 0),
              results:
                action === "add"
                  ? [comment, ...current.results]
                  : current.results.map((item) =>
                      item.id === id ? comment : item,
                    ),
            },
        );
        if (action === "add") setBody("");
        else setEditing(null);
      }
      setNotice(
        action === "delete"
          ? "Comment deleted."
          : action === "edit"
            ? "Comment updated."
            : "Comment added.",
      );
      // Reset paged discussion after writes so deletions cannot skip an older comment.
      // A failed read must never suggest reposting a saved comment.
      try {
        const [rows, history] = await Promise.all([
          request<Page<TaskComment>>(`${base}/comments/`),
          request<Page<TaskActivity>>(`${base}/activity/`),
        ]);
        setComments(rows);
        setActivity(history);
      } catch {
        setComments((current) => current && { ...current, next: null });
        setError(
          new Error(
            "Your comment change was saved, but the discussion could not be refreshed. Use Refresh discussion to retry.",
          ),
        );
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("add");
  }
  return (
    <Dialog title={`Discussion · ${task.title}`} onClose={onClose} busy={busy}>
      <div className="discussion">
        <p className="discussion-intro">TS-{task.id} · Comments and activity</p>
        {readOnly && (
          <p className="archive-banner">
            This project is archived. Comments and activity are read-only.
          </p>
        )}
        <ErrorNotice error={error} />
        <div className="discussion-refresh">
          <button
            className="text-button"
            onClick={() => void refresh()}
            disabled={busy || loading}
          >
            Refresh discussion
          </button>
        </div>
        {notice && (
          <p className="discussion-notice" role="status">
            {notice}
          </p>
        )}
        {loading && (
          <p className="discussion-notice" role="status">
            Loading discussion…
          </p>
        )}
        <section aria-labelledby="comments-heading">
          <h3 id="comments-heading">
            Comments{comments ? ` (${comments.count})` : ""}
          </h3>
          {comments && !readOnly && (
            <form onSubmit={submit} className="comment-form">
              <label htmlFor="comment-body">Add a comment</label>
              <textarea
                id="comment-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                required
                rows={3}
                disabled={busy}
                placeholder="Share an update or ask a question…"
              />
              <SubmitButton busy={busy} disabled={loading || !body.trim()}>
                Post comment
              </SubmitButton>
            </form>
          )}
          {comments?.count === 0 && (
            <p className="discussion-empty">
              No comments yet. Start the conversation.
            </p>
          )}
          <div className="comment-list">
            {comments?.results.map((comment) => (
              <article key={comment.id} className="comment">
                <div className="comment-heading">
                  <strong>{comment.author_name}</strong>
                  <Timestamp value={comment.created_at} />
                </div>
                {editing === comment.id && !readOnly ? (
                  <form
                    className="comment-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate("edit", comment.id);
                    }}
                  >
                    <label htmlFor={`edit-comment-${comment.id}`}>
                      Edit comment
                    </label>
                    <textarea
                      id={`edit-comment-${comment.id}`}
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      maxLength={4000}
                      required
                      rows={3}
                      disabled={busy}
                    />
                    <div className="comment-actions">
                      <SubmitButton
                        busy={busy}
                        disabled={loading || !editBody.trim()}
                      >
                        Save comment
                      </SubmitButton>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancel edit
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="comment-body">{comment.body}</p>
                )}
                {comment.updated_at !== comment.created_at && (
                  <span className="comment-edited">
                    Edited <Timestamp value={comment.updated_at} />
                  </span>
                )}
                {!readOnly &&
                  comment.author === user.id &&
                  editing !== comment.id && (
                    <div className="comment-actions">
                      {deleting === comment.id ? (
                        <>
                          <span>Delete this comment?</span>
                          <button
                            className="text-button danger-text"
                            disabled={busy || loading}
                            onClick={() => void mutate("delete", comment.id)}
                          >
                            Confirm delete
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => setDeleting(null)}
                          >
                            Keep comment
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="text-button"
                            disabled={busy || loading}
                            onClick={() => {
                              setEditing(comment.id);
                              setEditBody(comment.body);
                              setDeleting(null);
                            }}
                          >
                            Edit comment
                          </button>
                          <button
                            className="text-button danger-text"
                            disabled={busy || loading}
                            onClick={() => setDeleting(comment.id)}
                          >
                            Delete comment
                          </button>
                        </>
                      )}
                    </div>
                  )}
              </article>
            ))}
          </div>
          {comments?.next && (
            <button
              className="text-button"
              disabled={busy || loading}
              onClick={() => void loadMore("comments", comments.next!)}
            >
              Load more comments
            </button>
          )}
        </section>
        <section
          aria-labelledby="activity-heading"
          className="activity-section"
        >
          <h3 id="activity-heading">Activity</h3>
          {activity?.count === 0 && (
            <p className="discussion-empty">
              New changes will appear here. Earlier changes were not recorded.
            </p>
          )}
          <ol className="activity-list">
            {activity?.results.map((event) => (
              <li key={event.id}>
                <p>
                  <strong>{event.actor_name}</strong> {events[event.kind]}.
                </p>
                <Timestamp value={event.created_at} />
                {Object.entries(event.changes).map(([field, change]) => (
                  <p key={field} className="activity-change">
                    {field === "description"
                      ? "Description changed"
                      : `${labels[field] || field}: ${display(field, change.from)} → ${display(field, change.to)}`}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {activity?.next && (
            <button
              className="text-button"
              disabled={busy || loading}
              onClick={() => void loadMore("activity", activity.next!)}
            >
              Load more activity
            </button>
          )}
        </section>
      </div>
    </Dialog>
  );
}
