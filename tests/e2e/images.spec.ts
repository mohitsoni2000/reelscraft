import { expect, test } from "@playwright/test";
import { KB, MB, formatBytes, scrollThrough, settle, trackImageBytes } from "./helpers";

// Budgets for a phone visitor (390 x 844 @2x). "Initial" = everything fetched by the load event
// and the network going idle, without scrolling. "Full scroll" adds every lazy image below the fold.
const INITIAL_BUDGET = 700 * KB;
const FULL_SCROLL_BUDGET = 2.2 * MB;

test.describe("image weight on mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "budgets are defined for the mobile viewport");

  test("initial load downloads at most 700 KB of images", async ({ page }, testInfo) => {
    const images = trackImageBytes(page);
    await page.goto("/");
    await settle(page);

    const total = await images.total();
    await testInfo.attach("initial-images.txt", { body: await images.report(), contentType: "text/plain" });
    expect(images.count, "images requested on load").toBeGreaterThan(0);
    expect(total, `initial images: ${formatBytes(total)} (budget ${formatBytes(INITIAL_BUDGET)})\n${await images.report()}`).toBeLessThanOrEqual(INITIAL_BUDGET);
  });

  test("scrolling the whole page downloads at most 2.2 MB of images", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const images = trackImageBytes(page);
    await page.goto("/");
    await settle(page);
    await scrollThrough(page);
    await settle(page);

    const total = await images.total();
    await testInfo.attach("full-scroll-images.txt", { body: await images.report(30), contentType: "text/plain" });
    expect(total, `full scroll: ${formatBytes(total)} (budget ${formatBytes(FULL_SCROLL_BUDGET)})\n${await images.report()}`).toBeLessThanOrEqual(FULL_SCROLL_BUDGET);
  });
});
