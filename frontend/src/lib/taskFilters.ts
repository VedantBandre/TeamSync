import type { Task } from "./types";

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";
export function filterTasks(
  tasks: Task[],
  filters: {
    query: string;
    assignee: string;
    due: DueFilter;
    priority: string;
  },
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return tasks.filter((task) => {
    if (
      !`${task.title} ${task.description}`
        .toLowerCase()
        .includes(filters.query.trim().toLowerCase())
    )
      return false;
    if (
      filters.assignee === "unassigned"
        ? task.assigned_to !== null
        : filters.assignee !== "all" &&
          task.assigned_to !== Number(filters.assignee)
    )
      return false;
    if (filters.priority !== "all" && task.priority !== filters.priority)
      return false;
    if (filters.due === "all") return true;
    if (filters.due === "none") return task.due_date === null;
    if (!task.due_date || task.status === "DONE") return false;
    const deadline = new Date(task.due_date);
    if (filters.due === "overdue") return deadline < now;
    if (filters.due === "today")
      return deadline >= today && deadline < tomorrow;
    return deadline >= now && deadline < weekEnd;
  });
}
