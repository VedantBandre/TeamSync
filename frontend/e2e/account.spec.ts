import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

test("profile editing and the green dark theme survive refresh", async ({
  page,
  request,
}, testInfo) => {
  const username = `profile_${Date.now()}_${testInfo.project.name}`;
  const password = "Profile-test-password-520!";
  const api = "http://127.0.0.1:8001/api";
  expect(
    (
      await request.post(`${api}/register/`, { data: { username, password } })
    ).status(),
  ).toBe(201);
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "My Account" }).click();
  await page.getByLabel("Display name").fill("Vedant Green");
  await page.getByLabel("Nickname").fill("V");
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles(path.resolve("e2e/avatar.png"));
  await page.getByRole("button", { name: "💻 Focusing", exact: true }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Your profile is saved.");
  await expect(page.getByRole("button", { name: "My Account" })).toContainText(
    "Vedant Green",
  );
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Vedant Green");
  await expect(page.getByLabel("Nickname")).toHaveValue("V");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "Focusing",
  );
  await expect(
    page.getByRole("img", { name: "Profile photo preview" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("account-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: "Clear status" }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Your profile is saved.");
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Profile photo preview" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
