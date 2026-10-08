import {
  CalendarDays,
  Circle,
  CircleCheck,
  CircleDashed,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Membership, Task, TaskStatus } from "../lib/types";
import { statuses } from "../lib/types";

export function TaskBoard({
  tasks,
  members,
  pending,
  onEdit,
  onDelete,
  onStatus,
  onCreate,
}: {
  tasks: Task[];
  members: Membership[];
  pending: number | null;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  onCreate: (status: TaskStatus) => void;
}) {
  const icons = [CircleDashed, Circle, CircleCheck];
  return (
    <div className="board">
      {statuses.map((status, index) => {
        const items = tasks.filter((task) => task.status === status.value);
        const Icon = icons[index];
        return (
          <section
            className={`board-column column-${status.value.toLowerCase()}`}
            key={status.value}
            aria-labelledby={`column-${status.value}`}
          >
            <div className="column-heading">
              <h2 id={`column-${status.value}`}>
                <Icon size={17} />
                {status.label}
                <span className="count">{items.length}</span>
              </h2>
              <button
                className="icon-button"
                aria-label={`Create task from ${status.label}`}
                onClick={() => onCreate(status.value)}
                disabled={pending !== null}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="column-cards">
              {items.map((task) => {
                const assignee = members.find(
                  (member) => member.user === task.assigned_to,
                );
                const date = task.due_date ? new Date(task.due_date) : null;
                const overdue =
                  date && date.getTime() < Date.now() && task.status !== "DONE";
                return (
                  <article
                    className={`task-card ${task.status === "DONE" ? "completed" : ""}`}
                    key={task.id}
                  >
                    <div className="task-card-heading">
                      <span className="task-id">TS-{task.id}</span>
                      <div className="task-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${task.title}`}
                          onClick={() => onEdit(task)}
                          disabled={pending !== null}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${task.title}`}
                          onClick={() => onDelete(task)}
                          disabled={pending !== null}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      {date && (
                        <time
                          className={overdue ? "overdue" : ""}
                          dateTime={task.due_date!}
                        >
                          <CalendarDays size={13} />
                          {date.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                          {overdue ? " · Overdue" : ""}
                        </time>
                      )}
                      <span
                        className={`assignee ${assignee ? "" : "unassigned"}`}
                        title={assignee?.username || "Unassigned"}
                      >
                        {assignee ? (
                          <>
                            <span className="avatar tiny">
                              {assignee.username.slice(0, 2).toUpperCase()}
                            </span>
                            {assignee.username}
                          </>
                        ) : (
                          "Unassigned"
                        )}
                      </span>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={`task-status-${task.id}`}
                    >
                      Status of {task.title}
                    </label>
                    <select
                      id={`task-status-${task.id}`}
                      className="task-status"
                      value={task.status}
                      onChange={(event) =>
                        onStatus(task, event.target.value as TaskStatus)
                      }
                      disabled={pending !== null}
                    >
                      {statuses.map((choice) => (
                        <option value={choice.value} key={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
              {items.length === 0 && (
                <div className="empty-column">
                  <Icon size={23} />
                  <p>
                    {status.value === "DONE"
                      ? "Good work will land here."
                      : status.value === "IN_PROGRESS"
                        ? "Ready when you are."
                        : "Room for your next idea."}
                  </p>
                </div>
              )}
              <button
                className="add-card"
                onClick={() => onCreate(status.value)}
                disabled={pending !== null}
              >
                <Plus size={16} />
                Add task
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
