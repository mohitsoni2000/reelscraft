import { gsap } from "@/lib/gsap";
import { all, once, undrawn, type Scope } from "./util";

/** Fade every [data-reveal] element up as it scrolls into view. */
export function reveal(scope: Scope) {
  all("[data-reveal]", scope).forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: once(el) });
  });
}

/**
 * Draw horizontal rules on scroll. Markup contract (see DrawLine):
 * a <line data-draw-line> in a 1000-unit-wide viewBox; `data-from-center="true"`
 * grows it from the middle; `data-delay` is in seconds.
 */
export function drawLines(scope: Scope) {
  all<SVGLineElement>("[data-draw-line]", scope).forEach((line) => {
    const fromCenter = line.dataset.fromCenter === "true";
    const delay = Number(line.dataset.delay ?? 0);
    const from: gsap.TweenVars = fromCenter ? { attr: { x1: 500, x2: 500 } } : { attr: { x2: 0 } };
    gsap.fromTo(line, from, {
      attr: { x1: 0, x2: 1000 },
      duration: 1.2,
      delay,
      ease: "power2.inOut",
      scrollTrigger: once(line, "top 90%"),
    });
  });
}

/** Stroke-draw any <path data-draw-path> (arrows) on scroll. */
export function drawPaths(scope: Scope) {
  all<SVGPathElement>("[data-draw-path]", scope).forEach((path) => {
    gsap.fromTo(path, undrawn(path), { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut", scrollTrigger: once(path, "top 90%") });
  });
}

/**
 * Section headings (SectionHeading component): the whole line slides up from behind its
 * clipped mask, once, as it scrolls in — the same "editorial reveal" the hero title uses,
 * giving every section a matching, more deliberate entrance than a plain fade.
 */
export function revealHeadingLines(scope: Scope) {
  all("[data-heading-line]", scope).forEach((el) => {
    gsap.from(el, { yPercent: 108, duration: 0.9, ease: "power4.out", scrollTrigger: once(el, "top 88%") });
  });
}
