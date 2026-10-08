import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("an admin invites a teammate through sign-in and can revoke unused links", async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${Date.now()}_${testInfo.project.name}`;
  const owner = `invite_owner_${suffix}`;
  const guest = `invite_guest_${suffix}`;
  const other = `invite_other_${suffix}`;
  const password = "Invitation-test-password-520!";
  const api = "http://127.0.0.1:8001/api";
  async function account(username: string) {
    expect(
      (
        await request.post(`${api}/register/`, { data: { username, password } })
      ).status(),
    ).toBe(201);
    return (
      await (
        await request.post(`${api}/token/`, { data: { username, password } })
      ).json()
    ).access as string;
  }
  const ownerAccess = await account(owner);
  const otherAccess = await account(other);
  const ownerHeaders = { Authorization: `Bearer ${ownerAccess}` };
  const team = await (
    await request.post(`${api}/organizations/`, {
      headers: ownerHeaders,
      data: { name: "Invitation studio" },
    })
  ).json();
  const project = await (
    await request.post(`${api}/projects/`, {
      headers: ownerHeaders,
      data: { organization: team.id, name: "Team launch" },
    })
  ).json();
  const ownTeam = await (
    await request.post(`${api}/organizations/`, {
      headers: { Authorization: `Bearer ${otherAccess}` },
      data: { name: "Private studio" },
    })
  ).json();
  const ownProject = await (
    await request.post(`${api}/projects/`, {
      headers: { Authorization: `Bearer ${otherAccess}` },
      data: { organization: ownTeam.id, name: "Private work" },
    })
  ).json();
  const signIn = async (username: string) => {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await page.goto(`/?team=${team.id}&project=${project.id}&view=members`);
  await signIn(owner);
  await expect(
    page.getByRole("button", { name: "Create invitation", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const invitation = await page
    .getByLabel("Invitation link", { exact: true })
    .inputValue();
  expect(new URL(invitation).searchParams.get("invite")).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
  await page
    .getByRole("button", { name: "Copy invitation link", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Invitation link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    invitation,
  );
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const revoked = await page
    .getByLabel("Invitation link", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: /^Revoke invitation/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm revoke", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
  await expect(page.getByLabel("Invitation link", { exact: true })).toHaveCount(
    0,
  );
  const adminAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    adminAccessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("invitations.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(invitation);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(guest);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Your account is ready");
  expect(page.url()).toBe(invitation);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Invitation studio", exact: true }),
  ).toBeVisible();
  const guestAccess = (
    await (
      await request.post(`${api}/token/`, {
        data: { username: guest, password },
      })
    ).json()
  ).access;
  const guestTeamsBefore = await (
    await request.get(`${api}/organizations/`, {
      headers: { Authorization: `Bearer ${guestAccess}` },
    })
  ).json();
  expect(guestTeamsBefore).toEqual([]);
  const joinAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    joinAccessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("join-team.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Join team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your team." }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("invite")).toBe(false);
  await expect(page.getByText(guest, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create invitation", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Meet your team." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Project board" }).click();
  await expect(
    page.getByRole("heading", { name: "Team launch." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(invitation);
  await signIn(other);
  await expect(page.getByRole("alert")).toContainText("already been used");
  await expect(
    page.getByRole("button", { name: "Join team", exact: true }),
  ).toHaveCount(0);
  await page.goto(revoked);
  await expect(page.getByRole("alert")).toContainText("revoked");
  await page
    .getByRole("button", { name: "Go to my workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${ownProject.name}.` }),
  ).toBeVisible();
  const outsiderTeams = await (
    await request.get(`${api}/organizations/`, {
      headers: { Authorization: `Bearer ${otherAccess}` },
    })
  ).json();
  expect(outsiderTeams.map((item: { id: number }) => item.id)).toEqual([
    ownTeam.id,
  ]);
});
