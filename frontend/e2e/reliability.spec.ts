import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:8001/api";
const password = "Reliability-test-password-846!";
test("large boards refresh safely and account deletion preserves the team", async ({
  page,
  request,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const suffix = `${Date.now()}_${testInfo.project.name}`;
  const username = `owner_${suffix}`;
  const teammate = `member_${suffix}`;
  async function account(name: string) {
    const response = await request.post(`${api}/register/`, {
      data: { username: name, password },
    });
    expect(response.status()).toBe(201);
    const id = (await response.json()).id;
    const tokens = await (
      await request.post(`${api}/token/`, {
        data: { username: name, password },
      })
    ).json();
    return {
      id,
      headers: { Authorization: `Bearer ${tokens.access}` },
      tokens,
    };
  }
  const owner = await account(username);
  const member = await account(teammate);
  const team = await (
    await request.post(`${api}/organizations/`, {
      headers: owner.headers,
      data: { name: "Reliability studio" },
    })
  ).json();
  const membership = await (
    await request.post(`${api}/memberships/`, {
      headers: owner.headers,
      data: { organization: team.id, user: member.id },
    })
  ).json();
  const project = await (
    await request.post(`${api}/projects/`, {
      headers: owner.headers,
      data: { organization: team.id, name: "Large board" },
    })
  ).json();
  const tasks: { id: number }[] = [];
  for (let i = 0; i < 61; i++) {
    const response = await request.post(`${api}/tasks/`, {
      headers: owner.headers,
      data: {
        project: project.id,
        title: `Task ${String(i).padStart(3, "0")}`,
        assigned_to: owner.id,
        priority: i === 60 ? "URGENT" : "MEDIUM",
      },
    });
    expect(response.status()).toBe(201);
    tasks.push(await response.json());
  }
  await page.clock.install();
  await page.goto(`/?team=${team.id}&project=${project.id}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Task 000", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Page 1 of 2 · 61 matching tasks")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Task 060", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next tasks" }).click();
  await expect(
    page.getByRole("heading", { name: "Task 060", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter by priority").selectOption("URGENT");
  await expect(
    page.getByRole("heading", { name: "Task 060", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Task 050", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Showing 1 of 61 tasks.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Task 000", exact: true }),
  ).toBeVisible();
  const otherPage = await context.newPage();
  await otherPage.goto(`/?team=${team.id}&project=${project.id}`);
  await otherPage.getByLabel("Username").fill(teammate);
  await otherPage.getByLabel("Password", { exact: true }).fill(password);
  await otherPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await otherPage.getByLabel("Status of Task 000").selectOption("IN_PROGRESS");
  await expect(otherPage.getByLabel("Status of Task 000")).toHaveValue(
    "IN_PROGRESS",
  );
  await page.bringToFront();
  await page.clock.fastForward(21000);
  await expect(page.getByLabel("Status of Task 000")).toHaveValue(
    "IN_PROGRESS",
  );
  await expect(
    page.getByText("New updates are available on this board."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Comments and activity for Task 000" })
    .click();
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("Keep my unsent draft");
  expect(
    (
      await request.post(`${api}/tasks/${tasks[0].id}/comments/`, {
        headers: member.headers,
        data: { body: "A teammate's live reply" },
      })
    ).status(),
  ).toBe(201);
  await page.clock.fastForward(21000);
  await expect(
    page.getByText("A teammate's live reply", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue(
    "Keep my unsent draft",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  let outage = true;
  await page.route("**/api/tasks/?**", async (route) => {
    if (outage)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Temporary test outage" }),
      });
    else await route.continue();
  });
  await page.clock.fastForward(21000);
  await expect(page.getByRole("alert")).toContainText("Temporary test outage");
  await expect(
    page.getByRole("heading", { name: "Task 000", exact: true }),
  ).toBeVisible();
  outage = false;
  await page.clock.fastForward(41000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.unroute("**/api/tasks/?**");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "My Account", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText("You are the only admin for these teams.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Permanently delete account",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    (
      await request.patch(`${api}/memberships/${membership.id}/`, {
        headers: owner.headers,
        data: { role: "ADMIN" },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await page.getByLabel("Current password to delete account").fill(password);
  await page.getByLabel(`Type ${username} to confirm`).fill(username);
  await page.screenshot({
    path: testInfo.outputPath("account-deletion.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Permanently delete account", exact: true })
    .click();
  await expect(page.getByLabel("Username")).toBeVisible();
  expect(
    (await request.get(`${api}/me/`, { headers: owner.headers })).status(),
  ).toBe(401);
  const retained = await request.get(`${api}/projects/${project.id}/`, {
    headers: member.headers,
  });
  expect(retained.status()).toBe(200);
  const keptTeam = await (
    await request.get(`${api}/organizations/${team.id}/`, {
      headers: member.headers,
    })
  ).json();
  expect(keptTeam.created_by).toBe(member.id);
  const unassigned = await (
    await request.get(`${api}/tasks/${tasks[0].id}/`, {
      headers: member.headers,
    })
  ).json();
  expect(unassigned.assigned_to).toBeNull();
  await otherPage.close();
  expect(
    (
      await request.delete(`${api}/organizations/${team.id}/`, {
        headers: member.headers,
      })
    ).status(),
  ).toBe(204);
});

test("slow sign-in explains server startup without retrying the password request", async ({
  page,
  request,
}, testInfo) => {
  const username = `slow_${Date.now()}_${testInfo.project.name}`;
  expect(
    (
      await request.post(`${api}/register/`, { data: { username, password } })
    ).status(),
  ).toBe(201);
  await page.clock.install();
  let release!: () => void;
  let count = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/token/", async (route) => {
    count++;
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.clock.fastForward(6100);
  await expect(
    page.getByText("Connecting to your workspace…", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("server-startup.png"),
    fullPage: true,
  });
  release();
  await expect(
    page.getByRole("button", { name: "My Account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Connecting to your workspace…", { exact: true }),
  ).toHaveCount(0);
  expect(count).toBe(1);
});
