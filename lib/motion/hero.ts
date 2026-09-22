import { gsap } from "@/lib/gsap";
import { all, scrub, toAll, undrawn } from "./util";

/** Header intro: links and CTA slide down. The logo draws itself with CSS. */
export function nav(header: HTMLElement) {
  const items = all("[data-nav]", header);
  if (items.length) gsap.from(items, { y: -18, opacity: 0, stagger: 0.08, duration: 0.7, delay: 0.3, ease: "power3.out" });
}

/** Hero entrance timeline plus two scroll-linked parallax layers. */
export function hero(root: HTMLElement) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const add = (selector: string, vars: gsap.TweenVars, at: number) => {
    const targets = all(selector, root);
    if (targets.length) tl.from(targets, vars, at);
  };
  add("[data-line]", { yPercent: 110, stagger: 0.14, duration: 1, ease: "power4.out" }, 0.45);
  add("[data-card]", { y: 90, opacity: 0, scale: 0.97, duration: 1.2 }, 0.8);
  add("[data-img]", { scale: 1.12, duration: 2.4, ease: "power2.out" }, 0.8);
  add("[data-arrow]", { scale: 0, opacity: 0, stagger: 0.1, duration: 0.6, ease: "back.out(2)" }, 1.5);
  add("[data-badge]", { scale: 0, rotate: -25, duration: 0.8, ease: "back.out(1.6)" }, 1.55);
  add("[data-play]", { scale: 0.4, opacity: 0, duration: 0.7, ease: "back.out(2.2)" }, 1.4);
  add("[data-meta]", { y: 30, opacity: 0, stagger: 0.1, duration: 0.8 }, 1.6);

  const outline = root.querySelector<SVGPathElement>("[data-outline]");
  if (outline) {
    tl.fromTo(outline, undrawn(outline), { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut" }, 0.9)
      .to(outline, { opacity: 0, duration: 0.8 }, 3);
  }

  // The pattern lives on the page shell (behind the header too), so it is looked up globally.
  const pattern = document.querySelector<HTMLElement>("[data-hero-pattern]");
  if (pattern) {
    gsap.to(pattern, { yPercent: 20, ease: "none", scrollTrigger: { trigger: root, start: 0, end: "+=650", scrub: true } });
  }
  const card = root.querySelector<HTMLElement>("[data-card]");
  if (card) {
    toAll(root, "[data-img]", { yPercent: 5, ease: "none", scrollTrigger: scrub(card) });
  }
}
