import { expect, test, type Locator, type Page } from "@playwright/test";
import { settle } from "./helpers";

/** FAQ triggers are buttons in <main>; the menu toggle lives in <header>, so it is not matched. */
const TRIGGERS = "main button[aria-expanded][aria-controls]";

const boxHeight = (locator: Locator): Promise<number> =>
  locator.evaluate((el) => el.getBoundingClientRect().height);

/**
 * A locator pinned to one specific trigger. A plain `[aria-expanded="false"]` locator is
 * re-evaluated on every assertion, and in a single-open accordion the match changes as soon
 * as the click flips another item, so the trigger is pinned by its aria-controls id instead.
 */
async function firstClosedTrigger(page: Page): Promise<Locator> {
  const panelId = await page.locator(`${TRIGGERS}[aria-expanded="false"]`).first().getAttribute("aria-controls");
  expect(panelId, "a closed FAQ trigger with aria-controls").toBeTruthy();
  return page.locator(`button[aria-controls="${panelId}"]`);
}

test.describe("FAQ accordion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settle(page); // let React hydrate: a click before hydration is lost
  });

  test("triggers are real buttons whose aria-controls target exists", async ({ page }) => {
    const triggers = page.locator(TRIGGERS);
    expect(await triggers.count(), "FAQ triggers").toBeGreaterThanOrEqual(2);

    const problems = await triggers.evaluateAll((buttons) =>
      buttons.flatMap((button, index) => {
        const id = button.getAttribute("aria-controls") ?? "";
        const issues: string[] = [];
        if (button.tagName !== "BUTTON") issues.push(`trigger ${index} is <${button.tagName.toLowerCase()}>, not <button>`);
        if (!["true", "false"].includes(button.getAttribute("aria-expanded") ?? "")) issues.push(`trigger ${index} has no boolean aria-expanded`);
        if (!id || !document.getElementById(id)) issues.push(`trigger ${index}: no element with id "${id}"`);
        return issues;
      }),
    );
    expect(problems).toEqual([]);
  });

  test("clicking a closed trigger opens its panel; clicking again closes it", async ({ page }) => {
    const trigger = await firstClosedTrigger(page);
    const panelId = await trigger.getAttribute("aria-controls");
    const panel = page.locator(`[id="${panelId}"]`);
    await trigger.scrollIntoViewIfNeeded();

    const closedHeight = await boxHeight(panel);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => boxHeight(panel), { message: "open panel grows" }).toBeGreaterThan(closedHeight + 20);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => boxHeight(panel), { message: "panel collapses again" }).toBeLessThan(closedHeight + 2);
  });

  test("works from the keyboard (Space and Enter)", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard interaction is checked in the desktop project");
    const trigger = await firstClosedTrigger(page);
    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
