import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { request, save } from "../lib/api";
import type { Task, TaskComment } from "../lib/types";
import { TaskDiscussion } from "./TaskDiscussion";
vi.mock("../lib/api", () => ({ request: vi.fn(), save: vi.fn() }));
const task: Task = {
  id: 1,
  title: "Release",
  description: "",
  project: 1,
  assigned_to: null,
  status: "TODO",
  priority: "MEDIUM",
  due_date: null,
  created_at: "2026-10-08T12:00:00Z",
};
const user = { id: 1, username: "alice", email: "" };
const comment: TaskComment = {
  id: 1,
  task: 1,
  author: 1,
  author_name: "alice",
  body: "Ready to release",
  created_at: "2026-10-08T12:00:00Z",
  updated_at: "2026-10-08T12:00:00Z",
};
const page = <T,>(results: T[], next: string | null = null) => ({
  count: results.length,
  results,
  next,
  previous: null,
});
let rows: TaskComment[];
beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(save).mockReset();
  rows = [];
  vi.mocked(request).mockImplementation(async (path) =>
    path.includes("comments") ? page(rows) : page([]),
  );
});
async function open() {
  render(<TaskDiscussion task={task} user={user} onClose={vi.fn()} />);
  await screen.findByLabelText("Add a comment");
}
it("shows teammates' comments without controls for changing them", async () => {
  rows = [
    {
      ...comment,
      author: 2,
      author_name: "bob",
      body: "<script>hello</script>",
    },
  ];
  await open();
  expect(screen.getByText("<script>hello</script>")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Edit comment" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete comment" }),
  ).not.toBeInTheDocument();
});
it("preserves a draft when posting fails and clears it after a successful retry", async () => {
  const actor = userEvent.setup();
  await open();
  await actor.type(screen.getByLabelText("Add a comment"), "An update");
  vi.mocked(save).mockRejectedValueOnce(new Error("Please retry"));
  await actor.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
  expect(screen.getByLabelText("Add a comment")).toHaveValue("An update");
  vi.mocked(save).mockImplementationOnce(async () => {
    rows = [{ ...comment, body: "An update" }];
    return rows[0];
  });
  await actor.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByText("An update")).toBeVisible();
  expect(screen.getByLabelText("Add a comment")).toHaveValue("");
});
it("distinguishes a saved comment from failed history refresh to prevent reposts", async () => {
  const actor = userEvent.setup();
  await open();
  await actor.type(screen.getByLabelText("Add a comment"), "Saved once");
  vi.mocked(save).mockResolvedValueOnce({ ...comment, body: "Saved once" });
  vi.mocked(request).mockRejectedValue(new Error("Read unavailable"));
  await actor.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("was saved");
  expect(screen.getByText("Saved once")).toBeVisible();
  expect(screen.getByLabelText("Add a comment")).toHaveValue("");
  expect(save).toHaveBeenCalledTimes(1);
});
it("edits own comments and requires confirmation before deleting", async () => {
  rows = [comment];
  const actor = userEvent.setup();
  await open();
  await actor.click(screen.getByRole("button", { name: "Edit comment" }));
  await actor.clear(screen.getByLabelText("Edit comment"));
  await actor.type(screen.getByLabelText("Edit comment"), "Correction");
  vi.mocked(save).mockImplementationOnce(async () => {
    rows = [{ ...comment, body: "Correction" }];
    return rows[0];
  });
  await actor.click(screen.getByRole("button", { name: "Save comment" }));
  await screen.findByText("Correction");
  expect(save).toHaveBeenCalledWith(
    "/tasks/1/comments/1/",
    { body: "Correction" },
    "PATCH",
  );
  await actor.click(screen.getByRole("button", { name: "Delete comment" }));
  expect(
    vi
      .mocked(request)
      .mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  vi.mocked(request).mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") {
      rows = [];
      return undefined;
    }
    return path.includes("comments") ? page(rows) : page([]);
  });
  await actor.click(screen.getByRole("button", { name: "Confirm delete" }));
  expect(
    await screen.findByText("No comments yet. Start the conversation."),
  ).toBeVisible();
});
it("loads older comments without duplicating records across pages", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (!path.includes("comments")) return page([]);
    if (path.includes("page=2"))
      return page([comment, { ...comment, id: 2, body: "Older update" }]);
    return page(
      [comment],
      "http://127.0.0.1:8000/api/tasks/1/comments/?page=2",
    );
  });
  const actor = userEvent.setup();
  await open();
  await actor.click(screen.getByRole("button", { name: "Load more comments" }));
  await screen.findByText("Older update");
  expect(screen.getAllByText("Ready to release")).toHaveLength(1);
});
it("retries initial loading and ignores responses from a closed task", async () => {
  vi.mocked(request).mockRejectedValue(new Error("Network unavailable"));
  const actor = userEvent.setup();
  const view = render(
    <TaskDiscussion task={task} user={user} onClose={vi.fn()} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Network unavailable",
  );
  vi.mocked(request).mockImplementation(async () => page([]));
  await actor.click(screen.getByRole("button", { name: "Refresh discussion" }));
  await screen.findByLabelText("Add a comment");
  view.unmount();
  const resolvers: ((value: unknown) => void)[] = [];
  vi.mocked(request).mockImplementation(
    () =>
      new Promise((done) => {
        resolvers.push(done);
      }),
  );
  const old = render(
    <TaskDiscussion task={task} user={user} onClose={vi.fn()} />,
  );
  old.unmount();
  vi.mocked(request).mockImplementation(async () => page([]));
  render(
    <TaskDiscussion
      task={{ ...task, id: 2, title: "Other" }}
      user={user}
      onClose={vi.fn()}
    />,
  );
  await screen.findByLabelText("Add a comment");
  await act(async () => {
    resolvers.forEach((resolve) => resolve(page([comment])));
  });
  expect(
    within(screen.getByRole("dialog")).queryByText("Ready to release"),
  ).not.toBeInTheDocument();
});
