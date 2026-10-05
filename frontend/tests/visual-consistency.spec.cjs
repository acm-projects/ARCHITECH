const { test, expect } = require("@playwright/test");

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 900, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function auditViewport(page, label) {
  await page.waitForTimeout(80);
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const widest = Math.max(geometry.rootScrollWidth, geometry.bodyScrollWidth);
  expect(widest, `${label} should not overflow the viewport`).toBeLessThanOrEqual(geometry.innerWidth + 2);
  await page.screenshot({ path: `test-results/screens/${label}.png`, fullPage: true });
}

for (const viewport of viewports) {
  test(`major routes stay coherent at ${viewport.name}`, async ({ page }) => {
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator(".landing-v2")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Build systems\./ })).toBeVisible();
    await auditViewport(page, `${viewport.name}-01-landing`);

    await page.getByRole("button", { name: /Start building/i }).click();
    await expect(page.locator(".auth-card")).toBeVisible();
    await auditViewport(page, `${viewport.name}-02-signup`);

    await page.getByLabel("Display name").fill("Visual QA");
    await page.getByRole("button", { name: /Save local profile/i }).click();
    await expect(page.locator(".onboard-card")).toBeVisible();
    await auditViewport(page, `${viewport.name}-03-onboarding`);

    await page.getByRole("button", { name: /Open workspace/i }).click();
    await expect(page.locator(".home-page")).toBeVisible();
    const tour = page.getByRole("dialog", { name: "Dashboard tour" });
    if (await tour.isVisible().catch(() => false)) await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.locator(".task-dashboard-controlbar")).toBeVisible();
    await auditViewport(page, `${viewport.name}-04-home-recent`);

    await page.getByRole("tab", { name: "Challenges", exact: true }).click();
    await expect(page.locator(".challenge-browser")).toBeVisible();
    await auditViewport(page, `${viewport.name}-05-home-challenges`);
    await page.getByRole("tab", { name: "Recent work", exact: true }).click();

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator(".home-page.dark")).toBeVisible();
    await auditViewport(page, `${viewport.name}-06-home-dark`);
    await page.getByRole("button", { name: "Switch to light theme" }).click();

    await page.getByRole("button", { name: "New architecture" }).click();
    await expect(page.getByRole("dialog", { name: "Create new architecture" })).toBeVisible();
    await auditViewport(page, `${viewport.name}-07-new-architecture`);
    await page.getByRole("button", { name: /Open architecture/i }).click();

    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".workspace-header.product-header")).toBeVisible();
    await expect(page.locator(".main-canvas")).toBeVisible();
    await auditViewport(page, `${viewport.name}-08-workspace-learn`);

    const challengeMode = page.getByRole("button", { name: "Challenge", exact: true });
    if (await challengeMode.isVisible().catch(() => false)) {
      await challengeMode.click();
    } else {
      await page.evaluate(() => localStorage.setItem("architech-mode", "challenge"));
      await page.reload();
    }
    await expect(page.locator(".workspace")).toHaveClass(/challenge-mode/);
    await auditViewport(page, `${viewport.name}-09-workspace-challenge`);

    const challengeBrief = page.getByRole("dialog", { name: "Challenge brief" });
    if (await challengeBrief.isVisible().catch(() => false)) {
      await auditViewport(page, `${viewport.name}-10-challenge-brief`);
      await page.getByRole("button", { name: /Open canvas/i }).click();
      await expect(challengeBrief).toBeHidden();
    }

    const workspaceTheme = page.getByRole("button", { name: "Switch to dark theme" });
    if (await workspaceTheme.isVisible().catch(() => false)) {
      await workspaceTheme.click();
      await expect(page.locator(".workspace.dark")).toBeVisible();
      await auditViewport(page, `${viewport.name}-11-workspace-dark`);
    }

    await page.locator(".workspace-header .logo").click();
    await expect(page.locator(".landing-v2")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 240));
    await expect(page.locator(".landing-nav")).toHaveClass(/is-visible/);
    await page.getByRole("button", { name: /Open workspace/i }).click();
    await expect(page.getByRole("heading", { name: "Open your workspace" })).toBeVisible();
    await auditViewport(page, `${viewport.name}-12-signin`);

    expect(browserErrors, `browser errors at ${viewport.name}:\n${browserErrors.join("\n")}`).toEqual([]);
  });
}
