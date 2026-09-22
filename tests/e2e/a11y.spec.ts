import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./helpers";

// Reduced motion gives axe a deterministic, fully visible page (no half-faded reveal
// states that would make colour-contrast results flaky). Motion itself is tested in motion.spec.ts.
test.use({ reducedMotion: "reduce" });

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function describeViolations(violations: Violations): string {
  return violations
    .map((v) => {
      const targets = v.nodes.slice(0, 4).map((n) => `    ${n.target.join(" ")}`).join("\n");
      return `${v.id} (${v.impact ?? "n/a"}): ${v.help}\n${targets}\n    ${v.helpUrl}`;
    })
    .join("\n\n");
}

async function audit(page: Page): Promise<Violations> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations;
}

test.describe("accessibility (axe, WCAG 2.0/2.1 A and AA)", () => {
  test("home page has no violations", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await settle(page);
    const violations = await audit(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test("home page has no violations with the mobile menu open", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the menu toggle only exists below 640px");
    test.setTimeout(90_000);
    await page.goto("/");
    await settle(page);
    await page.locator('button[aria-controls="site-menu"]').click();
    await expect(page.locator("#site-menu")).toBeVisible();
    const violations = await audit(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test("404 page has no violations", async ({ page }) => {
    await page.goto("/404.html");
    await settle(page);
    const violations = await audit(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test("skip link is the first tab stop, becomes visible and moves focus to <main>", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard skip link check runs in the desktop project");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.locator("a.skip-link");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator("main#main")).toBeInViewport();
  });
});
