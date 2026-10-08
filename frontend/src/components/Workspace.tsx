import { useEffect, useState } from "react";
import { filterTasks, type DueFilter } from "../lib/taskFilters";
import { priorities } from "../lib/types";
import {
  ArrowRight,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Folder,
  FolderPlus,
  Layers3,
  Link,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { loadWorkspace, save } from "../lib/api";
import {
  navigateWorkspace,
  resolveWorkspaceRoute,
  useWorkspaceLocation,
  workspaceLink,
} from "../lib/navigation";
import type {
  Membership,
  Task,
  TaskStatus,
  User,
  WorkspaceData,
} from "../lib/types";
import { EditorDialog, type Editor } from "./Editors";
import { ErrorNotice } from "./Form";
import { TaskBoard } from "./TaskBoard";

const emptyData: WorkspaceData = {
  organizations: [],
  memberships: [],
  projects: [],
  tasks: [],
};

export function Workspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const location = useWorkspaceLocation();
  const [shareFeedback, setShareFeedback] = useState<{
    projectId: number;
    copied: boolean;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [assignee, setAssignee] = useState("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [priority, setPriority] = useState("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    loadWorkspace()
      .then((result) => {
        if (active) {
          setData(result);
          setLoaded(true);
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
  }, []);
  const { organization, project, tab, unavailable, canonical } =
    resolveWorkspaceRoute(location, data);
  const projects = data.projects.filter(
    (item) => item.organization === organization?.id,
  );
  useEffect(() => {
    if (loaded && !unavailable) navigateWorkspace(canonical, true);
  }, [loaded, unavailable, canonical]);
  useEffect(() => {
    document.title = unavailable
      ? "Workspace unavailable · TeamSync"
      : tab === "members"
        ? `${organization?.name || "Your team"} · Members · TeamSync`
        : `${project?.name || organization?.name || "Your workspace"} · TeamSync`;
  }, [unavailable, tab, organization?.name, project?.name]);
  useEffect(() => {
    const reset = () => {
      setEditor(null);
      setQuery("");
      setMine(false);
      setAssignee("all");
      setDue("all");
      setPriority("all");
      setShareFeedback(null);
    };
    window.addEventListener("popstate", reset);
    window.addEventListener("teamsync:navigation", reset);
    return () => {
      window.removeEventListener("popstate", reset);
      window.removeEventListener("teamsync:navigation", reset);
    };
  }, []);
  const members = data.memberships.filter(
    (item) => item.organization === organization?.id,
  );
  const isAdmin = members.some(
    (item) => item.user === user.id && item.role === "ADMIN",
  );
  const tasks = data.tasks.filter((task) => task.project === project?.id);
  const visibleTasks = filterTasks(tasks, {
    query,
    assignee: mine ? String(user.id) : assignee,
    due,
    priority,
  });
  const filtersActive =
    !!query ||
    mine ||
    assignee !== "all" ||
    due !== "all" ||
    priority !== "all";
  function clearFilters() {
    setQuery("");
    setMine(false);
    setAssignee("all");
    setDue("all");
    setPriority("all");
  }
  const completed = tasks.filter((task) => task.status === "DONE").length;
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  async function reload(resource?: string, id?: number, deleted = false) {
    setLoading(true);
    setError(null);
    try {
      const result = await loadWorkspace();
      setData(result);
      setLoaded(true);
      // A completed mutation must not redirect someone who navigated while it saved.
      if (window.location.pathname + window.location.search === location) {
        if (
          deleted &&
          !unavailable &&
          (resource === "organizations" || resource === "memberships") &&
          organization &&
          !result.organizations.some((team) => team.id === organization.id)
        ) {
          navigateWorkspace("/", true);
        } else if (deleted && resource === "projects" && id === project?.id) {
          const next = result.projects.find(
            (item) => item.organization === organization?.id,
          );
          navigateWorkspace(workspaceLink(organization?.id, next?.id), true);
        } else if (!deleted && resource === "organizations" && id) {
          navigateWorkspace(workspaceLink(id));
        } else if (!deleted && resource === "projects" && id) {
          const created = result.projects.find((item) => item.id === id);
          if (created)
            navigateWorkspace(workspaceLink(created.organization, created.id));
        }
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }
  async function updateStatus(task: Task, status: TaskStatus) {
    setPending(task.id);
    setError(null);
    try {
      const result = await save<Task>(
        `/tasks/${task.id}/`,
        { status },
        "PATCH",
      );
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === result.id ? result : item,
        ),
      }));
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(null);
    }
  }
  async function updateRole(member: Membership, role: string) {
    setPending(member.id);
    setError(null);
    try {
      await save(`/memberships/${member.id}/`, { role }, "PATCH");
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(null);
    }
  }
  function selectTeam(value: number) {
    const first = data.projects.find((item) => item.organization === value);
    navigateWorkspace(workspaceLink(value, first?.id));
  }
  function selectProject(value: number) {
    navigateWorkspace(workspaceLink(organization?.id, value));
  }
  function selectTab(value: "board" | "members") {
    navigateWorkspace(workspaceLink(organization?.id, project?.id, value));
  }
  const projectLink = project
    ? new URL(
        workspaceLink(project.organization, project.id),
        window.location.origin,
      ).href
    : "";
  async function copyProjectLink() {
    if (!project) return;
    try {
      await navigator.clipboard.writeText(projectLink);
      setShareFeedback({ projectId: project.id, copied: true });
    } catch {
      setShareFeedback({ projectId: project.id, copied: false });
    }
  }
  const openTask = (status: TaskStatus = "TODO") =>
    setEditor({ kind: "task", status });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          TeamSync<span className="brand-dot">.</span>
        </a>
        <div className="team-switcher">
          <label className="small-label" htmlFor="team-select">
            WORKSPACE
          </label>
          {data.organizations.length > 0 ? (
            <select
              id="team-select"
              value={organization?.id || ""}
              onChange={(event) => selectTeam(Number(event.target.value))}
            >
              {!organization && (
                <option value="" disabled>
                  Choose a team
                </option>
              )}
              {data.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted">Your team goes here</p>
          )}
          <button
            className="text-button new-team"
            onClick={() => setEditor({ kind: "organization" })}
            disabled={loading || !loaded}
          >
            <Plus size={14} />
            Create a team
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          <button
            className={`nav-item ${tab === "board" ? "active" : ""}`}
            onClick={() => selectTab("board")}
          >
            <LayoutDashboard size={18} />
            Project board
          </button>
          <button
            className={`nav-item ${tab === "members" ? "active" : ""}`}
            onClick={() => selectTab("members")}
            disabled={!organization}
          >
            <Users size={18} />
            Team members
            {members.length > 0 && (
              <span className="nav-count">{members.length}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-section-title">
          <span className="small-label">PROJECTS</span>
          {isAdmin && (
            <button
              className="icon-button"
              aria-label="Create project"
              disabled={loading}
              onClick={() => setEditor({ kind: "project" })}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <nav className="project-nav" aria-label="Projects">
          {projects.map((item) => (
            <a
              key={item.id}
              className={`project-link ${item.id === project?.id && tab === "board" ? "selected" : ""}`}
              href={workspaceLink(item.organization, item.id)}
              aria-current={
                item.id === project?.id && tab === "board" ? "page" : undefined
              }
              onClick={(event) => {
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  selectProject(item.id);
                }
              }}
            >
              <span className="project-dot" />
              <span>{item.name}</span>
              <ChevronRight size={14} />
            </a>
          ))}
          {!projects.length && (
            <p className="sidebar-empty">
              {organization
                ? "Your next project starts here."
                : "Create or join a team to get started."}
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-icon">
              <CheckCheck size={21} />
            </div>
            <strong>One step at a time.</strong>
            <p>Small moves make great projects.</p>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.username}</strong>
              <span>Member ID: {user.id}</span>
            </div>
            <button
              className="icon-button"
              onClick={onLogout}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{organization?.name || "Your workspace"}</span>
            <ChevronRight size={14} />
            <strong>{tab === "members" ? "Team members" : "Projects"}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={loading || pending !== null}
              onClick={() => void reload()}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>
        <main className="workspace-main">
          <div className="workspace-error">
            <ErrorNotice error={error} />
          </div>
          {loading && !loaded ? (
            <div className="large-empty" role="status">
              <LoaderCircle size={28} className="spin" />
              <h1>Opening your workspace…</h1>
            </div>
          ) : !loaded ? (
            <div className="large-empty">
              <span className="empty-illustration">
                <RefreshCw size={32} />
              </span>
              <h1>Couldn’t load your workspace.</h1>
              <p>
                Your work is still there. Check your connection and try again.
              </p>
              <button className="button primary" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          ) : unavailable ? (
            <div className="large-empty">
              <span className="empty-illustration">
                <Folder size={34} />
              </span>
              <h1>This workspace isn’t available.</h1>
              <p>
                The link may be incorrect, the project may have been deleted, or
                this account may not have access. Ask a team admin to check your
                membership.
              </p>
              <button
                className="button primary"
                onClick={() => navigateWorkspace("/")}
              >
                Back to workspace
              </button>
            </div>
          ) : !organization ? (
            <div className="large-empty onboarding">
              <span className="empty-illustration">
                <Layers3 size={36} />
              </span>
              <p className="eyebrow">A FRESH START</p>
              <h1>
                Your next great project
                <br />
                starts with your team.
              </h1>
              <p>
                Create a workspace to organize projects and bring your teammates
                together. Joining an existing team? Share your member ID{" "}
                <strong>{user.id}</strong> with its admin.
              </p>
              <button
                className="button primary"
                onClick={() => setEditor({ kind: "organization" })}
              >
                <Plus size={17} />
                Create your first team
                <ArrowRight size={17} />
              </button>
              {Boolean(error) && (
                <button className="text-button" onClick={() => void reload()}>
                  Try loading again
                </button>
              )}
            </div>
          ) : tab === "members" ? (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">BETTER, TOGETHER</p>
                  <h1>
                    Meet your team<span className="heading-dot">.</span>
                  </h1>
                  <p className="muted">
                    The people moving {organization.name} forward.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    className="button primary"
                    onClick={() => setEditor({ kind: "member" })}
                    disabled={loading || pending !== null}
                  >
                    <Plus size={17} />
                    Add member
                  </button>
                )}
              </section>
              <section className="members-panel">
                <div className="panel-heading">
                  <h2>{organization.name}</h2>
                  <span className="pill">
                    {members.length}{" "}
                    {members.length === 1 ? "person" : "people"}
                  </span>
                  {isAdmin && (
                    <div className="team-actions">
                      <button
                        className="icon-button"
                        aria-label="Rename team"
                        onClick={() =>
                          setEditor({
                            kind: "organization",
                            item: organization,
                          })
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Delete team"
                        onClick={() =>
                          setEditor({
                            kind: "delete",
                            resource: "organizations",
                            id: organization.id,
                            name: organization.name,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Member ID</th>
                        <th>Role</th>
                        {isAdmin && (
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <div className="member-name">
                              <span className="avatar">
                                {member.username.slice(0, 2).toUpperCase()}
                              </span>
                              <strong>{member.username}</strong>
                              {member.user === user.id && (
                                <span className="pill">You</span>
                              )}
                            </div>
                          </td>
                          <td className="muted">{member.user}</td>
                          <td>
                            {isAdmin ? (
                              <>
                                <label
                                  htmlFor={`role-${member.id}`}
                                  className="sr-only"
                                >
                                  Role of {member.username}
                                </label>
                                <select
                                  id={`role-${member.id}`}
                                  value={member.role}
                                  disabled={pending !== null || loading}
                                  onChange={(event) =>
                                    void updateRole(member, event.target.value)
                                  }
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="ADMIN">Admin</option>
                                </select>
                              </>
                            ) : (
                              <span className="role-label">
                                {member.role === "ADMIN" ? "Admin" : "Member"}
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              <button
                                className="icon-button"
                                disabled={pending !== null || loading}
                                aria-label={`Remove ${member.username}`}
                                onClick={() =>
                                  setEditor({
                                    kind: "delete",
                                    resource: "memberships",
                                    id: member.id,
                                    name: member.username,
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="form-hint members-hint">
                Admins manage the team and its projects. Members can create,
                assign, and update tasks.
              </p>
            </>
          ) : !project ? (
            <div className="large-empty onboarding">
              <span className="empty-illustration">
                <FolderPlus size={36} />
              </span>
              <p className="eyebrow">MAKE ROOM FOR GOOD WORK</p>
              <h1>
                A team in place.
                <br />
                Now, a project.
              </h1>
              <p>
                {isAdmin
                  ? "Give your first project a name, then break the work into manageable next steps."
                  : "Your team is ready. Ask an admin to create your first project."}
              </p>
              {isAdmin && (
                <button
                  className="button primary"
                  onClick={() => setEditor({ kind: "project" })}
                >
                  <Plus size={17} />
                  Create your first project
                </button>
              )}
            </div>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Folder size={14} />
                    PROJECT WORKSPACE
                  </p>
                  <h1>
                    {project.name}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p className="muted project-description">
                    {project.description ||
                      "A shared plan. A clear next step. Let’s move things forward."}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => void copyProjectLink()}
                  >
                    <Link size={16} />
                    Copy project link
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className="icon-button"
                        aria-label="Edit project"
                        onClick={() =>
                          setEditor({ kind: "project", item: project })
                        }
                        disabled={pending !== null}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Delete project"
                        onClick={() =>
                          setEditor({
                            kind: "delete",
                            resource: "projects",
                            id: project.id,
                            name: project.name,
                          })
                        }
                        disabled={pending !== null}
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  <button
                    className="button primary"
                    onClick={() => openTask()}
                    disabled={loading || pending !== null}
                  >
                    <Plus size={18} />
                    New task
                  </button>
                </div>
              </section>
              {shareFeedback?.projectId === project.id && (
                <div className="share-feedback" role="status">
                  {shareFeedback.copied ? (
                    "Project link copied. Teammates with access can open it."
                  ) : (
                    <>
                      <label htmlFor="project-link">
                        Copy this project link:
                      </label>
                      <input
                        id="project-link"
                        value={projectLink}
                        readOnly
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </>
                  )}
                </div>
              )}
              <section className="project-summary" aria-label="Project summary">
                <div className="summary-item">
                  <span className="summary-icon">
                    <ListTodo size={20} />
                  </span>
                  <div>
                    <span className="small-label">TOTAL TASKS</span>
                    <strong>
                      {tasks.length}
                      <span>on the board</span>
                    </strong>
                  </div>
                </div>
                <div className="summary-item">
                  <span className="summary-icon amber">
                    <CircleCheck size={20} />
                  </span>
                  <div>
                    <span className="small-label">IN PROGRESS</span>
                    <strong>
                      {
                        tasks.filter((task) => task.status === "IN_PROGRESS")
                          .length
                      }
                      <span>moving forward</span>
                    </strong>
                  </div>
                </div>
                <div className="summary-progress">
                  <div>
                    <span className="small-label">PROJECT PROGRESS</span>
                    <strong>{progress}%</strong>
                  </div>
                  <progress
                    value={completed}
                    max={tasks.length || 1}
                    aria-label="Completed tasks"
                  />
                  <span>
                    {completed} of {tasks.length} tasks completed
                  </span>
                </div>
              </section>
              <div className="board-toolbar">
                <div className="board-label">
                  <LayoutDashboard size={17} />
                  Board<span className="pill">{tasks.length}</span>
                </div>
                <div className="board-filters">
                  <label className="mine-filter">
                    <input
                      type="checkbox"
                      checked={mine}
                      onChange={(event) => {
                        setMine(event.target.checked);
                        setAssignee("all");
                      }}
                    />
                    Assigned to me
                  </label>
                  <select
                    aria-label="Filter by assignee"
                    value={assignee}
                    onChange={(event) => {
                      setAssignee(event.target.value);
                      setMine(false);
                    }}
                  >
                    <option value="all">All assignees</option>
                    <option value="unassigned">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.user}>
                        {member.username}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by due date"
                    value={due}
                    onChange={(event) =>
                      setDue(event.target.value as DueFilter)
                    }
                  >
                    <option value="all">All deadlines</option>
                    <option value="overdue">Overdue</option>
                    <option value="today">Due today</option>
                    <option value="week">Next 7 days</option>
                    <option value="none">No due date</option>
                  </select>
                  <select
                    aria-label="Filter by priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    <option value="all">All priorities</option>
                    {priorities.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      type="search"
                      aria-label="Search tasks"
                      placeholder="Search tasks…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              {filtersActive && (
                <p className="filter-empty" role="status">
                  {visibleTasks.length === 0
                    ? "No tasks match your filters."
                    : `Showing ${visibleTasks.length} of ${tasks.length} tasks.`}{" "}
                  <button className="text-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
              )}
              <TaskBoard
                tasks={visibleTasks}
                members={members}
                pending={pending ?? (loading ? -1 : null)}
                onEdit={(task) => setEditor({ kind: "task", item: task })}
                onDelete={(task) =>
                  setEditor({
                    kind: "delete",
                    resource: "tasks",
                    id: task.id,
                    name: task.title,
                  })
                }
                onStatus={(task, status) => void updateStatus(task, status)}
                onCreate={openTask}
              />
              <footer className="board-footer">
                <span>
                  <span className="mini-dot" />
                  {pending !== null
                    ? "Saving your changes…"
                    : loading
                      ? "Refreshing your workspace…"
                      : "Shared with your team"}
                </span>
                <span>
                  {members.length} {members.length === 1 ? "member" : "members"}{" "}
                  · {isAdmin ? "Admin" : "Member"} workspace
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {editor && (
        <EditorDialog
          key={JSON.stringify(editor)}
          editor={editor}
          organization={organization}
          project={project}
          members={members}
          onClose={() =>
            setEditor((current) => (current === editor ? null : current))
          }
          onSaved={reload}
        />
      )}
    </div>
  );
}
