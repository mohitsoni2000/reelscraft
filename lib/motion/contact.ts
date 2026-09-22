import { gsap } from "@/lib/gsap";
import { all, once, scrub, staggerIn, undrawn } from "./util";

export function contact(root: HTMLElement) {
  const steps = all("[data-step]", root);
  if (steps.length) {
    gsap.from(steps, { scale: 0.8, opacity: 0, stagger: 0.15, duration: 0.6, ease: "back.out(1.8)", scrollTrigger: once(steps[0]) });
  }
  staggerIn(root, "[data-card]", { y: 50, stagger: 0.15, duration: 0.9 }, "top 90%");

  const qr = root.querySelector<HTMLElement>("[data-qr]");
  if (qr) {
    gsap.from(qr, { y: 60, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: once(qr, "top 92%") });
    const frame = qr.querySelector<SVGRectElement>("[data-qr-frame]");
    if (frame) {
      gsap.fromTo(frame, undrawn(frame), { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut", scrollTrigger: once(qr, "top 85%") });
    }
  }

  const pattern = root.querySelector<HTMLElement>("[data-pattern]");
  if (pattern) gsap.to(pattern, { yPercent: -15, ease: "none", scrollTrigger: scrub(root) });
}
