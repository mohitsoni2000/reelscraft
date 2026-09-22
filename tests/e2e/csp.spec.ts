import { expect, test } from "@playwright/test";
import { probePage, scrollThrough, scrollToTop, settle } from "./helpers";

// The production host sends an ENFORCED Content-Security-Policy (deploy/headers.mjs). This test serves the
// exported site with exactly that header and uses every part of the page. Any blocked inline script, style,
// font, image or request shows up as a `securitypolicyviolation` event or a console error and fails the test.
test.describe("enforced Content-Security-Policy", () => {
  test("the whole site works under the production policy", async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    const { buildCsp } = await import("../../deploy/headers.mjs");
    const policy: string = buildCsp();

    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        w.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI || "(inline)"}`);
      });
    });

    // Add the header to HTML documents only, the way the real host does.
    await page.route("**/*", async (route) => {
      const response = await route.fetch();
      if (route.request().resourceType() !== "document") return route.fulfill({ response });
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
    });

    const probe = probePage(page);
    const response = await page.goto("/");
    expect(response?.headers()["content-security-policy"], "the test really enforces a policy").toBe(policy);
    await settle(page);

    // Use the interactive parts: menu (phone), FAQ, then the full scroll (lazy images, pinned gallery, GSAP).
    if (isMobile) {
      const toggle = page.getByRole("button", { name: "Menu" });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.click();
    }
    const faq = page.locator("[data-faq] button").nth(1);
    await faq.scrollIntoViewIfNeeded();
    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
    await scrollToTop(page);
    await scrollThrough(page);
    await settle(page);

    const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
    expect(violations, "CSP violations").toEqual([]);
    expect(probe.pageErrors, "uncaught exceptions").toEqual([]);
    expect(probe.consoleErrors.filter((text) => /content security policy|refused to/i.test(text)), "CSP console errors").toEqual([]);
    expect(probe.failedRequests, "failed requests").toEqual([]);
  });
});
