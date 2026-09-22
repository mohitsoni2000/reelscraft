import { gsap, ScrollTrigger } from "@/lib/gsap";

export type Scope = Element | Document;

/** Scoped querySelectorAll as a real array. */
export const all = <T extends Element = HTMLElement>(selector: string, scope: Scope): T[] =>
  Array.from(scope.querySelectorAll<T>(selector));

/**
 * The tween helpers below silently skip when nothing matches, so optional
 * elements (e.g. the hero arrows, which are absent when a page has no
 * carousel) never trigger GSAP's "target not found" warning.
 */
export function fromAll(scope: Scope, selector: string, vars: gsap.TweenVars) {
  const targets = all(selector, scope);
  if (targets.length) gsap.from(targets, vars);
}

export function fromToAll(scope: Scope, selector: string, from: gsap.TweenVars, to: gsap.TweenVars) {
  const targets = all(selector, scope);
  if (targets.length) gsap.fromTo(targets, from, to);
}

export function toAll(scope: Scope, selector: string, vars: gsap.TweenVars) {
  const targets = all(selector, scope);
  if (targets.length) gsap.to(targets, vars);
}

/** ScrollTrigger config: play once when `trigger` reaches `start`. Returns a fresh object each call. */
export const once = (trigger: Element | undefined, start = "top 88%"): ScrollTrigger.Vars => ({
  trigger,
  start,
  once: true,
});

/** Continuous scroll-linked config over the full time `trigger` is in view. */
export const scrub = (trigger: Element): ScrollTrigger.Vars => ({
  trigger,
  start: "top bottom",
  end: "bottom top",
  scrub: true,
});

/** Start state for drawing a stroke: fully undrawn. Tween `strokeDashoffset` to 0 to draw it. */
export const undrawn = (el: SVGGeometryElement): gsap.TweenVars => {
  const length = el.getTotalLength();
  return { strokeDasharray: length, strokeDashoffset: length };
};

/** Staggered fade-in of a group of items (opacity from 0 plus whatever else `vars` moves), played once. */
export function staggerIn(root: HTMLElement, selector: string, vars: gsap.TweenVars, start: string) {
  const items = all(selector, root);
  // clearProps: "all" removes every inline style GSAP set for this tween (transform, opacity, and the
  // individual scale/rotate/translate properties GSAP writes as "none" alongside it), so CSS :hover/:active
  // rules on these elements — including the standalone scale/translate/rotate properties, not just
  // `transform` — apply normally afterwards instead of being permanently shadowed by an inline style.
  if (items.length) gsap.from(items, { opacity: 0, ease: "power3.out", clearProps: "all", ...vars, scrollTrigger: once(items[0], start) });
}
