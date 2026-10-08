import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError, request, save } from "../lib/api";
import { AcceptInvitation, InvitationManager } from "./Invitations";
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  request: vi.fn(),
  save: vi.fn(),
}));
const organization = {
  id: 4,
  name: "Studio",
  created_at: "2026-10-08T00:00:00Z",
  created_by: 1,
};
const invitation = {
  id: 1,
  organization: 4,
  organization_name: "Studio",
  created_at: "2026-10-08T00:00:00Z",
  expires_at: "2026-10-15T00:00:00Z",
  accepted_at: null,
  revoked_at: null,
  state: "ACTIVE",
};
const preview = {
  organization: 4,
  organization_name: "Studio",
  expires_at: invitation.expires_at,
  already_member: false,
  role: "MEMBER",
};
const user = { id: 2, username: "sam", email: "" };
const token = "a".repeat(43);
beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(save).mockReset();
  window.history.replaceState(null, "", "/");
});
it("offers manual copying after clipboard failure and confirms revocation", async () => {
  const actor = userEvent.setup();
  vi.mocked(request).mockResolvedValue({
    results: [],
    count: 0,
    next: null,
    previous: null,
  });
  vi.mocked(save).mockResolvedValueOnce({ ...invitation, token });
  render(<InvitationManager organization={organization} />);
  await actor.click(
    await screen.findByRole("button", { name: "Create invitation" }),
  );
  const link = await screen.findByLabelText("Invitation link");
  expect(link).toHaveValue(`${window.location.origin}/?invite=${token}`);
  const clipboard = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("Denied"));
  await actor.click(
    screen.getByRole("button", { name: "Copy invitation link" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "copy it manually",
  );
  await actor.click(
    screen.getByRole("button", { name: "Revoke invitation 1" }),
  );
  expect(save).toHaveBeenCalledTimes(1);
  vi.mocked(save).mockResolvedValueOnce({ ...invitation, state: "REVOKED" });
  await actor.click(screen.getByRole("button", { name: "Confirm revoke" }));
  expect(await screen.findByRole("status")).toHaveTextContent("revoked");
  expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  clipboard.mockRestore();
});
it("retains the generated link when a later invitation creation fails", async () => {
  const actor = userEvent.setup();
  vi.mocked(request).mockResolvedValue({
    results: [],
    count: 0,
    next: null,
    previous: null,
  });
  vi.mocked(save).mockResolvedValueOnce({ ...invitation, token });
  render(<InvitationManager organization={organization} />);
  await actor.click(
    await screen.findByRole("button", { name: "Create invitation" }),
  );
  await screen.findByLabelText("Invitation link");
  vi.mocked(save).mockRejectedValueOnce(new Error("Creation failed"));
  await actor.click(screen.getByRole("button", { name: "Create invitation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Creation failed");
  expect(screen.getByLabelText("Invitation link")).toHaveValue(
    `${window.location.origin}/?invite=${token}`,
  );
});
it("previews without automatically joining and removes the token after joining", async () => {
  window.history.replaceState(null, "", `/?invite=${token}`);
  const actor = userEvent.setup();
  vi.mocked(save).mockResolvedValue(preview);
  render(<AcceptInvitation token={token} user={user} onLogout={vi.fn()} />);
  await screen.findByRole("button", { name: "Join team" });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith("/invitations/preview/", { token });
  await actor.click(screen.getByRole("button", { name: "Join team" }));
  expect(save).toHaveBeenLastCalledWith("/invitations/accept/", { token });
  expect(window.location.search).toBe("?team=4&view=members");
});
it("offers retry for a network failure but removes join after permanent refusal", async () => {
  const actor = userEvent.setup();
  vi.mocked(save).mockResolvedValueOnce(preview);
  render(<AcceptInvitation token={token} user={user} onLogout={vi.fn()} />);
  await screen.findByRole("button", { name: "Join team" });
  vi.mocked(save).mockRejectedValueOnce(new Error("Network unavailable"));
  await actor.click(screen.getByRole("button", { name: "Join team" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Network unavailable",
  );
  vi.mocked(save).mockRejectedValueOnce(
    new ApiError(410, { detail: "Invitation revoked" }),
  );
  await actor.click(screen.getByRole("button", { name: "Join team" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Invitation revoked",
  );
  expect(
    screen.queryByRole("button", { name: "Join team" }),
  ).not.toBeInTheDocument();
});
it("retains an invitation when switching accounts and clears it when leaving", async () => {
  const actor = userEvent.setup();
  const onLogout = vi.fn();
  window.history.replaceState(null, "", `/?invite=${token}`);
  vi.mocked(save).mockResolvedValue({ ...preview, already_member: true });
  render(<AcceptInvitation token={token} user={user} onLogout={onLogout} />);
  await screen.findByRole("button", { name: "Open team" });
  await actor.click(
    screen.getByRole("button", { name: "Use another account" }),
  );
  expect(onLogout).toHaveBeenCalledOnce();
  expect(window.location.search).toBe(`?invite=${token}`);
  await actor.click(screen.getByRole("button", { name: "Go to my workspace" }));
  expect(window.location.search).toBe("");
});
