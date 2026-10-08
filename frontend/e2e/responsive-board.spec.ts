import { expect, test } from "@playwright/test";

test("board fits its content and remains usable across screen sizes", async ({
  page,
  request,
}, testInfo) => {
  const api = "http://127.0.0.1:8001/api";
  const username = `layout_${Date.now()}_${testInfo.project.name}`;
  const password = "Layout-test-password-407!";
  const registration = await request.post(`${api}/register/`, {
    data: { username, password },
  });
  expect(registration.status()).toBe(201);
  const user = await registration.json();
  const login = await request.post(`${api}/token/`, {
    data: { username, password },
  });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).access}` };
  async function create(resource: string, data: Record<string, unknown>) {
    const response = await request.post(`${api}/${resource}/`, {
      data,
      headers,
    });
    expect(response.status()).toBe(201);
    return response.json();
  }
  const team = await create("organizations", { name: "Responsive studio" });
  const project = await create("projects", {
    organization: team.id,
    name: "A project with a longer name for small screens",
  });
  const task = await create("tasks", {
    project: project.id,
    title: "Review the responsive board",
    assigned_to: user.id,
  });
  await page.goto(`/?team=${team.id}&project=${project.id}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();

  async function assertNoOverflow() {
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const columns = await page
      .locator(".board-column")
      .evaluateAll((elements) =>
        elements.map((column) => {
          const bounds = column.getBoundingClientRect();
          const last = column.querySelector(".column-cards")!.lastElementChild!;
          return {
            height: bounds.height,
            contentHeight: last.getBoundingClientRect().bottom - bounds.top,
            bottomPadding: parseFloat(getComputedStyle(column).paddingBottom),
          };
        }),
      );
    // The tallest content defines the row, without an arbitrary height floor.
    if (page.viewportSize()!.width > 850) {
      expect(
        Math.max(...columns.map((c) => c.height)) -
          Math.min(...columns.map((c) => c.height)),
      ).toBeLessThanOrEqual(1);
      const tallestContent = Math.max(
        ...columns.map((c) => c.contentHeight + c.bottomPadding),
      );
      expect(columns[0].height - tallestContent).toBeLessThanOrEqual(2);
    }
  }

  for (const width of [320, 390, 600, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoOverflow();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await expect(page.getByLabel("Task title")).toBeVisible();
    await assertNoOverflow();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (width === 320 || width === 390 || width === 768 || width === 1440) {
      await page
        .locator(".board")
        .screenshot({ path: testInfo.outputPath(`board-${width}.png`) });
    }
  }
  const compactHeight = (await page
    .locator(".board-column")
    .first()
    .boundingBox())!.height;
  const extra = [];
  for (let index = 0; index < 3; index++) {
    extra.push(
      await create("tasks", {
        project: project.id,
        title: `More content ${index}`,
        description: "A longer task description to exercise growing columns.",
      }),
    );
  }
  await page.reload();
  await expect(page.locator(".task-card")).toHaveCount(4);
  await assertNoOverflow();
  expect(
    (await page.locator(".board-column").first().boundingBox())!.height,
  ).toBeGreaterThan(compactHeight + 150);
  for (const item of extra) {
    expect(
      (await request.delete(`${api}/tasks/${item.id}/`, { headers })).status(),
    ).toBe(204);
  }
  await page.reload();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await assertNoOverflow();
  expect(
    (await page.locator(".board-column").first().boundingBox())!.height,
  ).toBeCloseTo(compactHeight, 0);
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
    const targets = await page
      .locator(
        ".task-actions button, .column-heading button, .task-status, .add-card",
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      );
    expect(targets.every((height) => height >= 44)).toBe(true);
    await page
      .getByLabel(`Status of ${task.title}`)
      .selectOption("IN_PROGRESS");
    await expect(
      page
        .locator(".column-in_progress")
        .getByRole("heading", { name: task.title }),
    ).toBeVisible();
  }
});
