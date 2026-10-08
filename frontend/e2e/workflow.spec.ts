import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a team can register, organize projects, and move tasks forward", async ({
  page,
  request,
}, testInfo) => {
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
    () => document.documentElement.scrollWidth > window.innerWidth,
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
    page.getByRole("heading", { name: "Product launch." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit project" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Status of Build the first version")
    .selectOption("DONE");
  await expect(page.getByText("67%", { exact: true })).toBeVisible();
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
