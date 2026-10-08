import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function emailLink(email: string, action: string) {
  const directory = path.resolve("../backend/.e2e-emails");
  let link = "";
  await expect
    .poll(async () => {
      for (const name of await readdir(directory).catch(() => [])) {
        // Django wraps long plain-text links using quoted-printable MIME encoding.
        const content = (await readFile(path.join(directory, name), "utf8"))
          .replace(/=\r?\n/g, "")
          .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        if (content.includes(`To: ${email}`)) {
          const found = content.match(/http:\/\/127\.0\.0\.1:5174\/#\S+/)?.[0];
          if (
            found &&
            new URLSearchParams(new URL(found).hash.slice(1)).get("action") ===
              action
          )
            link = found;
        }
      }
      return link;
    })
    .not.toBe("");
  return link;
}

test("verified email recovery replaces a password and revokes existing sessions", async ({
  page,
  request,
}, testInfo) => {
  const username = `secure_${Date.now()}_${testInfo.project.name}`;
  const email = `${username}@example.com`;
  const password = "Security-test-password-891!";
  const nextPassword = "New-security-password-421!";
  const api = "http://127.0.0.1:8001/api";
  expect(
    (
      await request.post(`${api}/register/`, {
        data: { username, password, email },
      })
    ).status(),
  ).toBe(201);
  const tokens = await (
    await request.post(`${api}/token/`, { data: { username, password } })
  ).json();
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "My Account", exact: true }).click();
  await page.getByLabel("Recovery email", { exact: true }).fill(email);
  await page
    .getByLabel("Password to verify email", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Send verification email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await page.goto(await emailLink(email, "verify"));
  await expect(
    page.getByRole("heading", { name: "Verify your recovery email." }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  const headers = { Authorization: `Bearer ${tokens.access}` };
  expect(
    (await (await request.get(`${api}/me/`, { headers })).json())
      .email_verified,
  ).toBe(false);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your recovery email is verified.",
  );
  await page
    .getByRole("button", { name: "Continue to TeamSync", exact: true })
    .click();
  await page.getByRole("button", { name: "My Account", exact: true }).click();
  await expect(
    page.getByText(`Verified recovery email: ${email}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Recovery email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "If this is a verified recovery email",
  );
  await page.goto(await emailLink(email, "reset"));
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Different-password-521!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Passwords must match");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(nextPassword);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect((await request.get(`${api}/me/`, { headers })).status()).toBe(401);
  expect(
    (
      await request.post(`${api}/token/refresh/`, {
        data: { refresh: tokens.refresh },
      })
    ).status(),
  ).toBe(401);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("password-recovery.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Continue to TeamSync", exact: true })
    .click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "My Account", exact: true }),
  ).toBeVisible();
});
