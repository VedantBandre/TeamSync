import { describe, expect, it } from "vitest";
import { parseWorkspaceRoute, resolveWorkspaceRoute } from "./navigation";
import type { WorkspaceData } from "./types";

const data: WorkspaceData = {
  organizations: [
    { id: 1, name: "Studio", created_by: 1, created_at: "" },
    { id: 2, name: "Other team", created_by: 1, created_at: "" },
  ],
  projects: [
    { id: 10, name: "First", organization: 1, description: "", created_at: "" },
    {
      id: 20,
      name: "Second",
      organization: 2,
      description: "",
      created_at: "",
    },
  ],
  tasks: [],
  memberships: [],
};

describe("workspace links", () => {
  it("chooses a default board only when the link has no explicit selection", () => {
    expect(resolveWorkspaceRoute("/", data)).toMatchObject({
      organization: { id: 1 },
      project: { id: 10 },
      canonical: "/?team=1&project=10",
      unavailable: false,
    });
  });
  it("resolves project-only links to their owning team", () => {
    expect(resolveWorkspaceRoute("/?project=20", data)).toMatchObject({
      organization: { id: 2 },
      project: { id: 20 },
      canonical: "/?team=2&project=20",
      unavailable: false,
    });
  });
  it("retains the selected project on the member screen", () => {
    expect(
      resolveWorkspaceRoute("/?team=2&project=20&view=members", data),
    ).toMatchObject({
      tab: "members",
      project: { id: 20 },
      canonical: "/?team=2&project=20&view=members",
    });
  });
  it.each(["/?project=99", "/?team=99", "/?team=1&project=20"])(
    "does not substitute another board for an unavailable link: %s",
    (location) => {
      expect(resolveWorkspaceRoute(location, data)).toMatchObject({
        unavailable: true,
        organization: undefined,
        project: undefined,
        canonical: location,
      });
    },
  );
  it.each([
    "/?team=0",
    "/?project=-1",
    "/?project=abc",
    "/?project=1.5",
    "/?project=9007199254740992",
    "/?team=",
    "/?team=01",
    "/?team=1&team=2",
    "/?project=10&project=20",
    "/?view=unknown",
    "/?view=members&view=board",
    "/unknown",
  ])("rejects a malformed link: %s", (location) => {
    expect(parseWorkspaceRoute(location).invalid).toBe(true);
    expect(resolveWorkspaceRoute(location, data).unavailable).toBe(true);
  });
  it("allows teams without projects", () => {
    expect(
      resolveWorkspaceRoute("/?team=2", { ...data, projects: [] }),
    ).toMatchObject({
      organization: { id: 2 },
      project: undefined,
      unavailable: false,
      canonical: "/?team=2",
    });
  });
  it("allows a new account with no teams at the root", () => {
    expect(
      resolveWorkspaceRoute("/", {
        organizations: [],
        projects: [],
        tasks: [],
        memberships: [],
      }),
    ).toMatchObject({ unavailable: false, canonical: "/" });
  });
});
