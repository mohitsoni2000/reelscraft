import { expect, test, type Page } from "@playwright/test";
import { scrollThrough, scrollToTop, settle } from "./helpers";

/**
 * The marquee track: an explicit data-marquee-track hook, or the CSS-module class names
 * (Marquee-module__xxxx__track). Hashed module names change, hence the substring match.
 */
const MARQUEE_TRACK = '[data-marquee-track], [class*="marquee" i][class*="track" i]';

async function animationNames(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((el) => getComputedStyle(el).animationName),
  );
}

test.describe("prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing is pinned and no pin-spacer exists", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await settle(page);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);

    await scrollThrough(page);
    await expect(page.locator(".pin-spacer"), "after scrolling the whole page").toHaveCount(0);
    await expect(page.locator("[data-pinned]")).toHaveCount(0);
  });

  test("decorative loops are switched off", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const track = page.locator(MARQUEE_TRACK);
    expect(await track.count(), `no marquee track found with ${MARQUEE_TRACK} (add data-marquee-track to it)`).toBeGreaterThan(0);
    for (const name of await animationNames(page, MARQUEE_TRACK)) expect(name, "marquee track animation-name").toBe("none");

    // Belt and braces: not a single CSS animation may be running anywhere on the page.
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        // globals.css leaves a 0.01ms transition-duration under reduced motion; ignore transitions.
        .filter((a) => a.playState === "running" && !(a instanceof CSSTransition))
        .map((a) => (a instanceof CSSAnimation ? `animation:${a.animationName}` : "web-animation")),
    );
    expect(running, "running animations").toEqual([]);
  });

  test("all content is fully visible without scrolling (opacity 1)", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const faded = await page.evaluate(() => {
      const effectiveOpacity = (start: Element): number => {
        let value = 1;
        for (let node: Element | null = start; node; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity);
        return value;
      };
      const label = (el: Element) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
        return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}> "${text}"`;
      };
      return Array.from(document.querySelectorAll("h1, h2, h3, main section, footer, [data-reveal], [data-card], [data-faq]"))
        .map((el) => ({ label: label(el), opacity: effectiveOpacity(el) }))
        .filter((item) => item.opacity < 0.99)
        .map((item) => `${item.label} opacity=${item.opacity.toFixed(2)}`);
    });
    expect(faded, "elements that are not fully opaque under reduced motion").toEqual([]);
  });

  test("the pre-shoot gallery is a native horizontal scroller", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const scroller = page.locator("[data-scroller]").first();
    await expect(scroller, "gallery scroller ([data-scroller])").toHaveCount(1);
    await scroller.scrollIntoViewIfNeeded();

    const metrics = await scroller.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      tabIndex: el.tabIndex,
    }));
    expect(["auto", "scroll"], "overflow-x of the gallery").toContain(metrics.overflowX);
    expect(metrics.scrollWidth, "gallery content is wider than its box").toBeGreaterThan(metrics.clientWidth + 1);
    expect(metrics.tabIndex, "a scrollable region must be keyboard focusable").toBeGreaterThanOrEqual(0);

    await scroller.evaluate((el) => el.scrollTo({ left: 200, behavior: "instant" }));
    expect(await scroller.evaluate((el) => el.scrollLeft), "the gallery scrolls natively").toBeGreaterThan(0);
  });
});

test.describe("motion allowed (control group)", () => {
  test.use({ reducedMotion: "no-preference" });

  // Guards against the reduced-motion assertions passing only because the selectors match nothing.
  test("the marquee track does animate when motion is allowed", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const names = await animationNames(page, MARQUEE_TRACK);
    expect(names.length, `no marquee track found with ${MARQUEE_TRACK}`).toBeGreaterThan(0);
    expect(names.every((name) => name !== "none"), `animation-name values: ${names.join(", ")}`).toBe(true);
  });

  test("decorative loops are CSS animations, not script-driven", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await scrollThrough(page);
    await scrollToTop(page);
    const loops = await page.locator("[data-loop]").count();
    expect(loops, "elements marked data-loop").toBeGreaterThan(0);
    const cssAnimations = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation).length);
    expect(cssAnimations, "running CSS animations while motion is allowed").toBeGreaterThan(0);
  });
});
