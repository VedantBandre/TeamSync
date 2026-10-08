import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { clearSession, save } from "../lib/api";
import { AccountSecurity } from "./AccountSecurity";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  save: vi.fn(),
  clearSession: vi.fn(),
}));

it("shows unavailable email recovery while allowing a password change", async () => {
  render(
    <AccountSecurity
      user={{
        id: 1,
        username: "owner",
        email: "",
        email_recovery_available: false,
      }}
    />,
  );
  expect(
    screen.getByText(/Email recovery is not configured yet/),
  ).toBeVisible();
  expect(
    screen.queryByRole("form", { name: "Verify recovery email" }),
  ).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), "old-password");
  await user.type(screen.getByLabelText("New password"), "new-password");
  await user.type(
    screen.getByLabelText("Confirm new password"),
    "new-password",
  );
  await user.click(
    screen.getByRole("button", { name: "Change password and sign out" }),
  );
  expect(save).toHaveBeenCalledWith("/password/change/", {
    current_password: "old-password",
    new_password: "new-password",
    confirm_password: "new-password",
  });
  expect(clearSession).toHaveBeenCalledOnce();
});
