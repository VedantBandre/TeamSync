import { describe, expect, it } from "vitest";
import { filterTasks, type DueFilter } from "./taskFilters";
import type { Task } from "./types";
const now = new Date(2026, 9, 8, 12);
const date = (day: number, hour = 12) =>
  new Date(2026, 9, day, hour).toISOString();
const task = (id: number, changes: Partial<Task> = {}): Task => ({
  id,
  title: "Release",
  description: "Plan",
  project: 1,
  assigned_to: null,
  status: "TODO",
  priority: "MEDIUM",
  due_date: null,
  created_at: date(1),
  ...changes,
});
const tasks = [
  task(1, { due_date: date(7), assigned_to: 2, priority: "URGENT" }),
  task(2, { due_date: date(8, 9) }),
  task(3, { due_date: date(8, 18), assigned_to: 2 }),
  task(4, { due_date: date(14, 23) }),
  task(5, { due_date: date(15, 0) }),
  task(6),
  task(7, { due_date: date(7), status: "DONE" }),
];
const defaults = {
  query: "",
  assignee: "all",
  due: "all" as DueFilter,
  priority: "all",
};
describe("task filters", () => {
  it.each([
    ["overdue", [1, 2]],
    ["today", [2, 3]],
    ["week", [3, 4]],
    ["none", [6]],
  ] as [DueFilter, number[]][])(
    "filters %s using local calendar boundaries",
    (due, ids) => {
      expect(
        filterTasks(tasks, { ...defaults, due }, now).map((t) => t.id),
      ).toEqual(ids);
    },
  );
  it("combines assignee, priority, deadline and case-insensitive search", () => {
    expect(
      filterTasks(
        tasks,
        { query: " PLAN ", assignee: "2", priority: "URGENT", due: "overdue" },
        now,
      ).map((t) => t.id),
    ).toEqual([1]);
  });
  it("distinguishes unassigned tasks and includes completed tasks without a deadline filter", () => {
    expect(
      filterTasks(tasks, { ...defaults, assignee: "unassigned" }, now).map(
        (t) => t.id,
      ),
    ).toEqual([2, 4, 5, 6, 7]);
    expect(filterTasks(tasks, defaults, now)).toHaveLength(7);
  });
});
