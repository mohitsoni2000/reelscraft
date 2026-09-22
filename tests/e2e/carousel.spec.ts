import { expect, test } from "@playwright/test";

// Contract (see components/sections/HeroCarousel.tsx):
//  - one slide: the arrows are DECORATIVE, they keep the card's notches filled as in the design
//    but are not controls: not buttons, hidden from assistive tech, not focusable, and the hero
//    is not announced as a carousel;
//  - two or more slides: the arrows are real "Previous slide" / "Next slide" buttons that switch slides.
test.describe("hero carousel", () => {
  test("arrows are decorative with one slide and real buttons with several", async ({ page }) => {
    await page.goto("/");

    const slides = page.locator('[aria-roledescription="slide"]');
    const slideCount = await slides.count();
    const previous = page.getByRole("button", { name: "Previous slide" });
    const next = page.getByRole("button", { name: "Next slide" });

    if (slideCount <= 1) {
      await expect(previous, "no interactive previous control for a single slide").toHaveCount(0);
      await expect(next, "no interactive next control for a single slide").toHaveCount(0);
      await expect(page.locator('[aria-roledescription="carousel"]'), "a single slide is not announced as a carousel").toHaveCount(0);

      const decorative = page.locator("[data-arrow]");
      await expect(decorative, "the two design arrows are still drawn").toHaveCount(2);
      for (const arrow of await decorative.all()) {
        expect(await arrow.evaluate((el) => el.tagName), "decorative arrows are not buttons").not.toBe("BUTTON");
        await expect(arrow).toHaveAttribute("aria-hidden", "true");
        expect(await arrow.evaluate((el) => getComputedStyle(el).pointerEvents), "decorative arrows ignore the pointer").toBe("none");
        expect(await arrow.evaluate((el) => el.matches("a, button, [tabindex]")), "decorative arrows are not focusable").toBe(false);
      }
      return;
    }

    await expect(previous).toBeVisible();
    await expect(next).toBeVisible();
    const visibleLabel = () => page.locator('[aria-roledescription="slide"]:not([aria-hidden="true"])').first().getAttribute("aria-label");
    const before = await visibleLabel();
    await next.click();
    await expect.poll(visibleLabel, { message: "Next slide changes the visible slide" }).not.toBe(before);
    await previous.click();
    await expect.poll(visibleLabel, { message: "Previous slide returns" }).toBe(before);
  });
});
