import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  window.history.replaceState(null, "", "/");
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
        archived_at: null,
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
        priority: "MEDIUM",
        due_date: null,
        created_at: "2026-10-01",
      },
    ],
  };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (path, options) => {
    const url = String(path);
    if (url.startsWith("/api/invitations/?"))
      return json({ count: 0, results: [], next: null, previous: null });
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
    if (/^\/api\/projects\/1\/(archive|restore)\/$/.test(url)) {
      data.projects[0].archived_at = url.includes("/archive/")
        ? "2026-10-08T12:00:00Z"
        : null;
      return json(data.projects[0]);
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
  await actor.selectOptions(dialog.getByLabelText("Priority"), "URGENT");
  await actor.click(dialog.getByRole("button", { name: "Create task" }));
  await screen.findByRole("heading", { name: "Ship release" });
  expect(data.tasks[1].assigned_to).toBe(2);
  expect(data.tasks[1].priority).toBe("URGENT");
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

function addSecondProject() {
  data.projects.push({ ...data.projects[0], id: 2, name: "Second project" });
}

it("opens a non-default project directly from its URL", async () => {
  addSecondProject();
  window.history.replaceState(null, "", "/?team=1&project=2");
  setSession({ access: "access", refresh: "refresh" });
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Plan release" }),
  ).not.toBeInTheDocument();
  expect(document.title).toBe("Second project · TeamSync");
});

it("keeps a project link through sign-in", async () => {
  const actor = userEvent.setup();
  addSecondProject();
  window.history.replaceState(null, "", "/?project=2");
  render(<App />);
  await actor.type(screen.getByLabelText("Username"), "alice");
  await actor.type(screen.getByLabelText("Password"), "password");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  expect(
    await screen.findByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await waitFor(() => expect(window.location.search).toBe("?team=1&project=2"));
});

it("updates the address when switching projects and member tabs", async () => {
  const actor = userEvent.setup();
  addSecondProject();
  await openWorkspace();
  await actor.click(screen.getByRole("link", { name: "Second project" }));
  expect(window.location.search).toBe("?team=1&project=2");
  expect(
    screen.getByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await actor.click(screen.getByRole("button", { name: /Team members/ }));
  expect(window.location.search).toBe("?team=1&project=2&view=members");
  await actor.click(screen.getByRole("button", { name: "Project board" }));
  expect(
    screen.getByRole("heading", { name: "Second project." }),
  ).toBeVisible();
});

it("responds to browser history changes and closes the old editor", async () => {
  const actor = userEvent.setup();
  addSecondProject();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "New task" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  // jsdom does not perform actual browser navigation; emulate a popstate destination.
  window.history.replaceState(null, "", "/?team=1&project=2");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(
    await screen.findByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows an unavailable screen rather than a different project for a bad link", async () => {
  const actor = userEvent.setup();
  window.history.replaceState(null, "", "/?team=1&project=999");
  setSession({ access: "access", refresh: "refresh" });
  render(<App />);
  expect(
    await screen.findByRole("heading", {
      name: "This workspace isn’t available.",
    }),
  ).toBeVisible();
  expect(window.location.search).toBe("?team=1&project=999");
  expect(
    screen.queryByRole("heading", { name: /Launch plan/ }),
  ).not.toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Back to workspace" }));
  expect(
    await screen.findByRole("heading", { name: /Launch plan/ }),
  ).toBeVisible();
});

it("copies a project link without granting anyone new access", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  await actor.click(screen.getByRole("button", { name: "Copy project link" }));
  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}/?team=1&project=1`,
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Project link copied",
  );
  writeText.mockRestore();
});

it("offers a selectable link when clipboard access fails", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("Denied"));
  await actor.click(screen.getByRole("button", { name: "Copy project link" }));
  expect(await screen.findByLabelText("Copy this project link:")).toHaveValue(
    `${window.location.origin}/?team=1&project=1`,
  );
  writeText.mockRestore();
});

it("moves to another project after deleting the currently selected project", async () => {
  const actor = userEvent.setup();
  addSecondProject();
  const healthy = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, options) => {
    if (path === "/api/projects/1/" && options?.method === "DELETE") {
      data.projects = data.projects.filter((project) => project.id !== 1);
      data.tasks = [];
      return new Response(null, { status: 204 });
    }
    return healthy(path, options);
  });
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "Delete project" }));
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  expect(window.location.search).toBe("?team=1&project=2");
});

it("does not redirect or close a new editor when an old save finishes after navigation", async () => {
  const actor = userEvent.setup();
  addSecondProject();
  const healthy = fetchMock.getMockImplementation()!;
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(async (path, options) => {
    if (path === "/api/tasks/" && options?.method === "POST") {
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return healthy(path, options);
  });
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "New task" }));
  await actor.type(screen.getByLabelText("Task title"), "Slow task");
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Create task",
    }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => {
    window.history.replaceState(null, "", "/?team=1&project=2");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(
    await screen.findByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await actor.click(screen.getByRole("button", { name: "New task" }));
  await actor.type(screen.getByLabelText("Task title"), "New draft");
  await act(async () => {
    finish(json({ id: 2 }, 201));
  });
  await waitFor(() =>
    expect(
      screen.queryByText("Refreshing your workspace…"),
    ).not.toBeInTheDocument(),
  );
  expect(window.location.search).toBe("?team=1&project=2");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("Task title")).toHaveValue("New draft");
});

it("edits a task priority and filters the saved result", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "Edit Plan release" }));
  const dialog = within(screen.getByRole("dialog"));
  await actor.selectOptions(dialog.getByLabelText("Priority"), "LOW");
  await actor.click(dialog.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Low priority");
  expect(data.tasks[0].priority).toBe("LOW");
  await actor.selectOptions(
    screen.getByLabelText("Filter by priority"),
    "HIGH",
  );
  expect(
    screen.queryByRole("heading", { name: "Plan release" }),
  ).not.toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "Plan release" })).toBeVisible();
});

it("archives with confirmation, preserves the board, and restores from the archive list", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  await actor.click(screen.getByRole("button", { name: "Archive project" }));
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(data.projects[0].archived_at).toBeNull();
  await actor.click(screen.getByRole("button", { name: "Archive project" }));
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Archive project",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "archived and read-only",
  );
  expect(screen.getByRole("heading", { name: "Plan release" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "New task" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Status of Plan release")).toBeDisabled();
  await actor.click(screen.getByRole("button", { name: /Archived projects/ }));
  await actor.click(
    screen.getByRole("button", { name: "Restore Launch plan" }),
  );
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Restore project",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await actor.click(screen.getByRole("link", { name: "Launch plan" }));
  expect(screen.getByRole("button", { name: "New task" })).toBeEnabled();
  expect(screen.getByLabelText("Status of Plan release")).toBeEnabled();
});

it("keeps the confirmation open when archiving fails", async () => {
  const actor = userEvent.setup();
  await openWorkspace();
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, options) =>
    String(path).endsWith("/archive/")
      ? Promise.resolve(json({ detail: "Please retry later." }, 503))
      : original(path, options),
  );
  await actor.click(screen.getByRole("button", { name: "Archive project" }));
  await actor.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Archive project",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please retry later.",
  );
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(data.projects[0].archived_at).toBeNull();
});
