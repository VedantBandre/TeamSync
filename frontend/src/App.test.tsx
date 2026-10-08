import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { setSession } from "./lib/api";
import type { Task, User, WorkspaceData } from "./lib/types";

let user: User;
let data: WorkspaceData;
const fetchMock = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  user = { id: 1, username: "alice", email: "" };
  data = {
    organizations: [
      { id: 1, name: "Studio", created_by: 1, created_at: "2026-10-01" },
    ],
    memberships: [
      { id: 1, user: 1, username: "alice", organization: 1, role: "ADMIN" },
      { id: 2, user: 2, username: "bob", organization: 1, role: "MEMBER" },
    ],
    projects: [
      {
        id: 1,
        name: "Launch plan",
        description: "Build it together.",
        organization: 1,
        created_at: "2026-10-01",
      },
    ],
    tasks: [
      {
        id: 1,
        title: "Plan release",
        description: "Agree on the scope.",
        project: 1,
        assigned_to: 2,
        status: "TODO",
        due_date: null,
        created_at: "2026-10-01",
      },
    ],
  };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (path, options) => {
    const url = String(path);
    if (url === "/api/token/")
      return json({ access: "access", refresh: "refresh" });
    if (url === "/api/register/")
      return json({ id: 1, username: "alice" }, 201);
    if (url === "/api/me/") return json(user);
    if (url === "/api/tasks/" && options?.method === "POST") {
      const payload = JSON.parse(String(options.body));
      if (payload.title === "Rejected")
        return json({ title: ["Please choose another title."] }, 400);
      const task: Task = { ...payload, id: 2, created_at: "2026-10-08" };
      data.tasks.push(task);
      return json(task, 201);
    }
    if (url === "/api/tasks/1/" && options?.method === "PATCH") {
      Object.assign(data.tasks[0], JSON.parse(String(options.body)));
      return json(data.tasks[0]);
    }
    if (url === "/api/tasks/1/" && options?.method === "DELETE") {
      data.tasks = data.tasks.filter((task) => task.id !== 1);
      return new Response(null, { status: 204 });
    }
    const resource = url.split("/")[2] as keyof WorkspaceData;
    return json(data[resource] || {}, 200);
  });
});

async function openWorkspace() {
  setSession({ access: "access", refresh: "refresh" });
  render(<App />);
  await screen.findByRole("heading", { name: /Launch plan/ });
}

it("signs in and loads the real workspace endpoints", async () => {
  const actor = userEvent.setup();
  render(<App />);
  await actor.type(screen.getByLabelText("Username"), "alice");
  await actor.type(screen.getByLabelText("Password"), "password");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: /Launch plan/ });
  expect(screen.getByRole("heading", { name: "Plan release" })).toBeVisible();
});

it("registers an account and returns to sign-in with confirmation", async () => {
  const actor = userEvent.setup();
  render(<App />);
  await actor.click(screen.getByRole("button", { name: "Create an account" }));
  await actor.type(screen.getByLabelText("Username"), "alice");
  await actor.type(screen.getByLabelText("Password"), "Strong-password-123!");
  await actor.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Your account is ready",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
});

it("creates an assigned task and displays it on the board", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "New task" }));
  const dialog = within(screen.getByRole("dialog"));
  await actor.type(dialog.getByLabelText("Task title"), "Ship release");
  await actor.selectOptions(dialog.getByLabelText("Assignee"), "2");
  await actor.click(dialog.getByRole("button", { name: "Create task" }));
  await screen.findByRole("heading", { name: "Ship release" });
  expect(data.tasks[1].assigned_to).toBe(2);
  expect(data.tasks[1].project).toBe(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("creates tasks in the selected column", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(
    screen.getByRole("button", { name: "Create task from In progress" }),
  );
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByLabelText("Status")).toHaveValue("IN_PROGRESS");
  await actor.type(dialog.getByLabelText("Task title"), "Build release");
  await actor.click(dialog.getByRole("button", { name: "Create task" }));
  await screen.findByRole("heading", { name: "Build release" });
  expect(data.tasks[1].status).toBe("IN_PROGRESS");
});

it("moves a task and updates the progress summary", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.selectOptions(
    screen.getByLabelText("Status of Plan release"),
    "DONE",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Status of Plan release")).toHaveValue("DONE"),
  );
  expect(screen.getByText("100%")).toBeVisible();
});

it("keeps the editor open and shows field validation errors", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "New task" }));
  const dialog = within(screen.getByRole("dialog"));
  await actor.type(dialog.getByLabelText("Task title"), "Rejected");
  await actor.click(dialog.getByRole("button", { name: "Create task" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Please choose another title",
  );
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("filters tasks and clears an empty search", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.type(
    screen.getByRole("searchbox", { name: "Search tasks" }),
    "missing",
  );
  expect(
    screen.queryByRole("heading", { name: "Plan release" }),
  ).not.toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "Plan release" })).toBeVisible();
  await actor.click(screen.getByLabelText("Assigned to me"));
  expect(
    screen.queryByRole("heading", { name: "Plan release" }),
  ).not.toBeInTheDocument();
});

it("requires confirmation before deleting a task", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(
    screen.getByRole("button", { name: "Delete Plan release" }),
  );
  expect(data.tasks).toHaveLength(1);
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Plan release" }),
    ).not.toBeInTheDocument(),
  );
  expect(data.tasks).toHaveLength(0);
});

it("hides admin controls from a member", async () => {
  const actor = userEvent.setup();
  user = { id: 2, username: "bob", email: "" };
  await openWorkspace();
  expect(
    screen.queryByRole("button", { name: "Create project" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit project" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New task" })).toBeVisible();
  await actor.click(screen.getByRole("button", { name: /Team members/ }));
  expect(
    await screen.findByRole("heading", { name: /Meet your team/ }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add member" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "Role of alice" }),
  ).not.toBeInTheDocument();
});

it("logs out and clears the tab session", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "Sign out" }));
  expect(
    await screen.findByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(sessionStorage.getItem("teamsync.session")).toBeNull();
});

it("shows a retry screen instead of empty onboarding when loading fails", async () => {
  const actor = userEvent.setup();
  const healthy = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path) =>
    String(path) === "/api/me/"
      ? json(user)
      : json({ detail: "Service unavailable" }, 503),
  );
  setSession({ access: "access", refresh: "refresh" });
  render(<App />);
  expect(
    await screen.findByRole("heading", {
      name: "Couldn’t load your workspace.",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Create your first team" }),
  ).not.toBeInTheDocument();
  fetchMock.mockImplementation(healthy);
  await actor.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("heading", { name: /Launch plan/ }),
  ).toBeVisible();
});

it("returns to sign-in when the restored session has expired", async () => {
  fetchMock.mockResolvedValue(json({ detail: "Expired session" }, 401));
  setSession({ access: "expired", refresh: "expired-refresh" });
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(sessionStorage.getItem("teamsync.session")).toBeNull();
});
