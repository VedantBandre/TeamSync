import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("archives preserve readable work and admins can restore it", async ({
  page,
  request,
}, testInfo) => {
  const api = "http://127.0.0.1:8001/api";
  const username = `archive_${Date.now()}_${testInfo.project.name}`;
  const password = "Archive-test-password-520!";
  expect(
    (
      await request.post(`${api}/register/`, { data: { username, password } })
    ).status(),
  ).toBe(201);
  const access = (
    await (
      await request.post(`${api}/token/`, { data: { username, password } })
    ).json()
  ).access;
  const headers = { Authorization: `Bearer ${access}` };
  const team = await (
    await request.post(`${api}/organizations/`, {
      headers,
      data: { name: "Archive studio" },
    })
  ).json();
  const project = await (
    await request.post(`${api}/projects/`, {
      headers,
      data: {
        organization: team.id,
        name: "Finished launch",
        description: "A launch worth keeping.",
      },
    })
  ).json();
  const task = await (
    await request.post(`${api}/tasks/`, {
      headers,
      data: { project: project.id, title: "Release checklist" },
    })
  ).json();
  expect(
    (
      await request.post(`${api}/tasks/${task.id}/comments/`, {
        headers,
        data: { body: "Keep the release notes." },
      })
    ).status(),
  ).toBe(201);
  const board = `/?team=${team.id}&project=${project.id}`;
  await page.goto(board);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "archived and read-only",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Release checklist" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Status of Release checklist")).toBeDisabled();
  expect(
    (
      await request.patch(`${api}/tasks/${task.id}/`, {
        headers,
        data: { status: "DONE" },
      })
    ).status(),
  ).toBe(400);
  await page
    .getByRole("button", {
      name: "Comments and activity for Release checklist",
    })
    .click();
  await expect(
    page.getByText("Keep the release notes.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Add a comment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit comment" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: testInfo.outputPath("archived-board.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Archived projects/ }).click();
  await expect(
    page.getByRole("link", { name: "Finished launch", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations.map(({ id }) => id)).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("archived-projects.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Restore Finished launch" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("No archived projects in this team yet."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Finished launch", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Status of Release checklist").selectOption("DONE");
  await expect(page.getByLabel("Status of Release checklist")).toBeEnabled();
  await expect(page.getByLabel("Status of Release checklist")).toHaveValue(
    "DONE",
  );
  await page.reload();
  await expect(page.getByLabel("Status of Release checklist")).toHaveValue(
    "DONE",
  );
  await page
    .getByRole("button", {
      name: "Comments and activity for Release checklist",
    })
    .click();
  await expect(
    page.getByText("Keep the release notes.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Add a comment")).toBeEnabled();
});
