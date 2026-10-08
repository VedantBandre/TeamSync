import { useSyncExternalStore } from "react";
import type { Organization, Project, WorkspaceData } from "./types";

export interface WorkspaceRoute {
  teamId: number | null;
  projectId: number | null;
  tab: "board" | "members";
  invalid: boolean;
}

export function parseWorkspaceRoute(location: string): WorkspaceRoute {
  const url = new URL(location, "http://teamsync.local");
  let invalid = url.pathname !== "/";
  function id(name: string) {
    const values = url.searchParams.getAll(name);
    if (!values.length) return null;
    const value = Number(values[0]);
    if (
      values.length !== 1 ||
      !/^[1-9]\d*$/.test(values[0]) ||
      !Number.isSafeInteger(value)
    ) {
      invalid = true;
      return null;
    }
    return value;
  }
  const teamId = id("team");
  const projectId = id("project");
  const views = url.searchParams.getAll("view");
  if (
    views.length > 1 ||
    (views.length && !["board", "members"].includes(views[0]))
  )
    invalid = true;
  return {
    teamId,
    projectId,
    tab: views[0] === "members" ? "members" : "board",
    invalid,
  };
}

export function workspaceLink(
  teamId?: number | null,
  projectId?: number | null,
  tab: WorkspaceRoute["tab"] = "board",
) {
  const params = new URLSearchParams();
  if (teamId) params.set("team", String(teamId));
  if (projectId) params.set("project", String(projectId));
  if (tab === "members") params.set("view", tab);
  return params.size ? `/?${params}` : "/";
}

export function resolveWorkspaceRoute(
  location: string,
  data: WorkspaceData,
): {
  organization?: Organization;
  project?: Project;
  tab: WorkspaceRoute["tab"];
  unavailable: boolean;
  canonical: string;
} {
  const route = parseWorkspaceRoute(location);
  const requestedProject =
    route.projectId === null
      ? undefined
      : data.projects.find((project) => project.id === route.projectId);
  const teamId = route.teamId ?? requestedProject?.organization;
  const organization =
    teamId === undefined || teamId === null
      ? data.organizations[0]
      : data.organizations.find((team) => team.id === teamId);
  const unavailable =
    route.invalid ||
    (route.projectId !== null && !requestedProject) ||
    (route.teamId !== null && !organization) ||
    Boolean(
      requestedProject &&
      (!organization || requestedProject.organization !== organization.id),
    );
  const project =
    requestedProject ??
    data.projects.find((item) => item.organization === organization?.id);
  return {
    organization: unavailable ? undefined : organization,
    project: unavailable ? undefined : project,
    tab: route.tab,
    unavailable,
    canonical: unavailable
      ? location
      : workspaceLink(organization?.id, project?.id, route.tab),
  };
}

function snapshot() {
  return window.location.pathname + window.location.search;
}
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("teamsync:navigation", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("teamsync:navigation", listener);
  };
}
export function useWorkspaceLocation() {
  return useSyncExternalStore(subscribe, snapshot, () => "/");
}
export function navigateWorkspace(target: string, replace = false) {
  if (snapshot() === target) return;
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  window.dispatchEvent(new Event("teamsync:navigation"));
}
