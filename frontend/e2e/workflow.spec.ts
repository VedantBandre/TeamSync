import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a team can register, organize projects, and move tasks forward", async ({
  page,
  request,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("teamsync.theme", "dark"),
  );
  const suffix = `${Date.now()}_${testInfo.project.name}`;
  const owner = `alex_${suffix}`;
  const teammate = `sam_${suffix}`;
  const password = "A-strong-test-password-904!";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.screenshot({
    path: testInfo.outputPath("sign-in.png"),
    fullPage: true,
  });
  const authAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    authAccessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(owner);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Your account is ready");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create your first team" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Design studio");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByRole("button", { name: "Create your first project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Product launch");
  await page
    .getByLabel("Description (optional)")
    .fill("A thoughtful launch, one clear next step at a time.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Product launch." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title").fill("Build the first version");
  await page.getByLabel("Priority", { exact: true }).selectOption("HIGH");
  await page
    .getByLabel("Description (optional)")
    .fill("Bring the core workflow together and test it with the team.");
  await page
    .getByLabel("Assignee", { exact: true })
    .selectOption({ label: owner });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Build the first version" }),
  ).toBeVisible();
  await page
    .getByLabel("Status of Build the first version")
    .selectOption("IN_PROGRESS");
  await expect(
    page.getByLabel("Status of Build the first version"),
  ).toHaveValue("IN_PROGRESS");

  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title").fill("Prepare launch notes");
  await page
    .getByLabel("Description (optional)")
    .fill("A short guide to what is new and how to get started.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare launch notes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create task from Done" }).click();
  await page.getByLabel("Task title").fill("Agree on the project scope");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByText("33%", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("board.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const boardAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    boardAccessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Product launch." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build the first version" }),
  ).toBeVisible();

  const releaseCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Build the first version" }),
  });
  await expect(
    releaseCard.getByText("High priority", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter by priority").selectOption("HIGH");
  await expect(
    page.getByRole("heading", { name: "Prepare launch notes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by assignee").selectOption("unassigned");
  await expect(
    page.getByRole("heading", { name: "Build the first version" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  if (testInfo.project.name === "desktop") {
    await page.route("**/api/tasks/*/", async (route) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Move failed. Try again." }),
        });
      else await route.continue();
    });
    await page
      .getByTitle("Drag Build the first version to another column")
      .dragTo(page.locator(".column-done"));
    await expect(page.getByRole("alert")).toContainText("Move failed");
    await expect(
      page.getByLabel("Status of Build the first version"),
    ).toHaveValue("IN_PROGRESS");
    await page.unroute("**/api/tasks/*/");
    await page
      .getByTitle("Drag Build the first version to another column")
      .dragTo(page.locator(".column-done"));
    await expect(
      page.getByLabel("Status of Build the first version"),
    ).toHaveValue("DONE");
    await page.reload();
    await expect(
      page.getByLabel("Status of Build the first version"),
    ).toHaveValue("DONE");
    await page
      .getByLabel("Status of Build the first version")
      .selectOption("IN_PROGRESS");
    await expect(
      page.getByLabel("Status of Build the first version"),
    ).toHaveValue("IN_PROGRESS");
  }

  await page
    .getByRole("button", {
      name: "Comments and activity for Build the first version",
    })
    .click();
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("First launch update");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("First launch update", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit comment", exact: true }).click();
  await page
    .getByLabel("Edit comment", { exact: true })
    .fill("Updated launch plan");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(
    page.getByText("Updated launch plan", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(
    page.getByText("Updated launch plan", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("Ready for team review");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("Ready for team review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${owner} edited a comment.`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Status: To do → In progress", { exact: true }),
  ).toBeVisible();
  const discussionAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    discussionAccessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("discussion.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Comments and activity for Build the first version",
    })
    .click();
  await expect(
    page.getByText("Ready for team review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: /Team members/ }).click();
  await page.getByLabel(`Role of ${owner}`).selectOption("MEMBER");
  await expect(page.getByRole("alert")).toContainText("at least one admin");
  await expect(page.getByLabel(`Role of ${owner}`)).toHaveValue("ADMIN");
  const registration = await request.post(
    "http://127.0.0.1:8001/api/register/",
    { data: { username: teammate, password } },
  );
  expect(registration.status()).toBe(201);
  const memberId = (await registration.json()).id;
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page.getByLabel("Member ID", { exact: true }).fill(String(memberId));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add member", exact: true })
    .click();
  await expect(page.getByText(teammate, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill(teammate);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your team." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Project board" }).click();
  await expect(
    page.getByRole("heading", { name: "Product launch." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit project" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Status of Build the first version")
    .selectOption("DONE");
  await expect(page.getByText("67%", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Comments and activity for Build the first version",
    })
    .click();
  await expect(
    page.getByText("Ready for team review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit comment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete comment", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("Reviewed by teammate");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("Reviewed by teammate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit comment", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("unmatched");
  await expect(page.getByRole("status")).toContainText("No tasks match");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Build the first version" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Team members/ }).click();
  await expect(
    page.getByRole("button", { name: "Add member", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("project links survive sign-in, refresh, history, and denied access", async ({
  page,
  request,
  context,
}, testInfo) => {
  const api = "http://127.0.0.1:8001/api";
  const suffix = `${Date.now()}_${testInfo.project.name}`;
  const username = `navigation_${suffix}`;
  const outsider = `outsider_${suffix}`;
  const password = "A-strong-test-password-904!";
  async function account(name: string) {
    expect(
      (
        await request.post(`${api}/register/`, {
          data: { username: name, password },
        })
      ).status(),
    ).toBe(201);
    const response = await request.post(`${api}/token/`, {
      data: { username: name, password },
    });
    expect(response.status()).toBe(200);
    return { Authorization: `Bearer ${(await response.json()).access}` };
  }
  const headers = await account(username);
  async function create(
    resource: string,
    data: Record<string, unknown>,
    authorization = headers,
  ) {
    const response = await request.post(`${api}/${resource}/`, {
      data,
      headers: authorization,
    });
    expect(response.status()).toBe(201);
    return response.json();
  }
  const team = await create("organizations", { name: "Navigation team" });
  const other = await create("organizations", { name: "Second team" });
  const first = await create("projects", {
    organization: team.id,
    name: "First project",
  });
  const second = await create("projects", {
    organization: team.id,
    name: "Second project",
  });
  const third = await create("projects", {
    organization: other.id,
    name: "Third project",
  });
  const outsiderHeaders = await account(outsider);
  const outsiderTeam = await create(
    "organizations",
    { name: "Private team" },
    outsiderHeaders,
  );
  await create(
    "projects",
    { organization: outsiderTeam.id, name: "Private project" },
    outsiderHeaders,
  );
  const secondPath = `/?team=${team.id}&project=${second.id}`;
  await page.goto(secondPath);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`team=${team.id}&project=${second.id}$`),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "First project", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`team=${team.id}&project=${first.id}$`),
  );
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Second project." }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "First project." }),
  ).toBeVisible();
  await page
    .getByLabel("WORKSPACE", { exact: true })
    .selectOption(String(other.id));
  await expect(
    page.getByRole("heading", { name: "Third project." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Team members/ }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Meet your team." }),
  ).toBeVisible();
  await expect(page.getByLabel("WORKSPACE", { exact: true })).toHaveValue(
    String(other.id),
  );
  await page.getByRole("button", { name: "Project board" }).click();
  await expect(
    page.getByRole("heading", { name: "Third project." }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
  await page.getByRole("button", { name: "Copy project link" }).click();
  await expect(page.getByRole("status")).toContainText("Project link copied");
  const sharedURL = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(sharedURL).search).toBe(
    `?team=${other.id}&project=${third.id}`,
  );
  await page.getByRole("button", { name: "Delete project" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /A team in place/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`team=${other.id}$`));
  await page.goto(sharedURL);
  await expect(
    page.getByRole("heading", { name: "This workspace isn’t available." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "First project." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(secondPath);
  await page.getByLabel("Username").fill(outsider);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This workspace isn’t available." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Second project." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Private project." }),
  ).toBeVisible();
});
