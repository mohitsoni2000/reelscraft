import { expect, test } from "@playwright/test";
import { foreignHosts, probePage, scrollThrough, scrollToTop, settle } from "./helpers";

test.describe("smoke", () => {
  test("home page loads without console errors or failed requests", async ({ page }) => {
    test.setTimeout(90_000);
    const probe = probePage(page);

    const response = await page.goto("/");
    expect(response?.status(), "HTTP status of /").toBe(200);
    await settle(page);
    await scrollThrough(page); // trigger lazy images and scroll-driven code
    await settle(page);

    expect(probe.pageErrors, "uncaught exceptions").toEqual([]);
    expect(probe.consoleErrors, "console errors").toEqual([]);
    expect(probe.failedRequests, "failed requests").toEqual([]);
    expect(probe.badResponses, "responses with status >= 400").toEqual([]);
  });

  test("makes no requests to third-party hosts", async ({ page }) => {
    test.setTimeout(90_000);
    const probe = probePage(page);

    await page.goto("/");
    await settle(page);
    await scrollThrough(page);
    await settle(page);

    expect(foreignHosts(probe.requestedUrls), "hosts other than the local server").toEqual([]);

    // Outbound links are plain <a href>s: present in the DOM, never fetched.
    const instagramLinks = page.locator('a[href*="instagram.com"]');
    expect(await instagramLinks.count(), "Instagram links on the page").toBeGreaterThan(0);
    expect(probe.requestedUrls.filter((url) => url.includes("instagram")), "requests to Instagram").toEqual([]);
  });

  test("has the expected document structure and landmarks", async ({ page, isMobile }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("html")).toHaveAttribute("lang", /^[a-z]{2}/i);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main"]')).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);

    // Primary nav lives in the header. On mobile it is a dropdown that is hidden until opened.
    const primaryNav = page.locator('header nav[aria-label="Primary"]');
    await expect(primaryNav).toHaveCount(1);
    const toggle = page.locator('button[aria-controls="site-menu"]');
    await expect(toggle).toHaveCount(1);
    if (isMobile) {
      await expect(toggle).toBeVisible();
      await expect(primaryNav).toBeHidden();
    } else {
      await expect(toggle).toBeHidden();
      await expect(primaryNav).toBeVisible();
    }
  });

  test("unknown URLs get the custom 404 page with a 404 status", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

// Horizontal overflow is checked with a desktop-style context so setViewportSize is exact.
test.describe("no horizontal overflow", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, in the desktop project");

  for (const width of [320, 390, 768, 1440]) {
    test(`at ${width}px wide`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await settle(page);
      await scrollThrough(page);
      await scrollToTop(page);

      const result = await page.evaluate(() => {
        const doc = document.documentElement;
        const viewport = doc.clientWidth;
        const clipped = (el: Element): boolean => {
          for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            const { overflowX } = getComputedStyle(node);
            if (overflowX !== "visible") return true;
          }
          return false;
        };
        const offenders = Array.from(document.body.querySelectorAll("*"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > viewport + 1 && !clipped(el);
          })
          .slice(0, 6)
          .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.getAttribute("class") ?? "").slice(0, 60)}"> right=${Math.round(el.getBoundingClientRect().right)}`);
        window.scrollTo({ left: 200, top: 0, behavior: "instant" });
        return { viewport, scrollWidth: doc.scrollWidth, scrolledX: window.scrollX, offenders };
      });

      expect(result.scrollWidth, `document is wider than the ${result.viewport}px viewport; candidates: ${result.offenders.join(" | ")}`).toBeLessThanOrEqual(result.viewport + 1);
      expect(result.scrolledX, "the page must not scroll sideways").toBe(0);
    });
  }
});
