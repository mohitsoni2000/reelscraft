import { expect, test } from "@playwright/test";
import { settle } from "./helpers";

const TOGGLE = 'button[aria-controls="site-menu"]';
const PANEL = "#site-menu";

test.describe("mobile menu (below 640px)", () => {
  test.skip(({ isMobile }) => !isMobile, "the toggle only exists below 640px");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settle(page); // let React hydrate: a click before hydration is lost
  });

  test("toggle opens and closes the panel and reports aria-expanded", async ({ page }) => {
    const toggle = page.locator(TOGGLE);
    const panel = page.locator(PANEL);

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link").first()).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
  });

  test("Escape closes the panel and returns focus to the toggle", async ({ page }) => {
    const toggle = page.locator(TOGGLE);
    const panel = page.locator(PANEL);

    await toggle.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  test("choosing a link closes the panel", async ({ page }) => {
    const toggle = page.locator(TOGGLE);
    const panel = page.locator(PANEL);

    await toggle.click();
    await expect(panel).toBeVisible();
    const link = panel.getByRole("link").first();
    const href = await link.getAttribute("href");
    await link.click();

    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    if (href?.startsWith("#")) await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});

test.describe("primary navigation on wide screens", () => {
  test.skip(({ isMobile }) => isMobile, "desktop project only");

  test("links are always visible and there is no toggle", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();
    expect(await nav.getByRole("link").count(), "primary navigation links").toBeGreaterThanOrEqual(2);
    await expect(page.locator(TOGGLE)).toBeHidden();
  });

  test("every in-page link points at a section that exists", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator('header a[href^="#"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      if (href === "#") continue;
      await expect(page.locator(href), `target of ${href}`).toHaveCount(1);
    }
  });

  test("the toggle appears exactly below 640px", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(TOGGLE);
    for (const width of [320, 390, 639]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(toggle, `toggle at ${width}px`).toBeVisible();
    }
    for (const width of [640, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(toggle, `toggle at ${width}px`).toBeHidden();
    }
  });
});
