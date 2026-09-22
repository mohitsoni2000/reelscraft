import { gsap } from "@/lib/gsap";
import { all, fromAll, once, scrub, staggerIn, toAll, undrawn } from "./util";

export function about(root: HTMLElement) {
  const visual = root.querySelector<HTMLElement>("[data-visual]");
  if (visual) {
    fromAll(root, "[data-frame]", { rotate: -6, scale: 0.9, opacity: 0, duration: 1.1, ease: "power3.out", scrollTrigger: once(visual, "top 80%") });
    fromAll(root, "[data-photo]", { y: 60, opacity: 0, duration: 1.1, delay: 0.2, ease: "power3.out", scrollTrigger: once(visual, "top 80%") });
    toAll(root, "[data-photo]", { yPercent: -6, ease: "none", scrollTrigger: scrub(visual) });
  }

  staggerIn(root, "[data-item]", { x: -20, stagger: 0.12, duration: 0.7 }, "top 88%");
  const firstItem = root.querySelector<HTMLElement>("[data-item]");
  all<SVGPathElement>("[data-tick]", root).forEach((tick, i) => {
    gsap.fromTo(tick, undrawn(tick), {
      strokeDashoffset: 0,
      duration: 0.5,
      delay: 0.2 + i * 0.12,
      ease: "power2.out",
      scrollTrigger: once(firstItem ?? tick),
    });
  });
}
