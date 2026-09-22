import { fromAll, fromToAll, once, scrub } from "./util";

export function visualShoots(root: HTMLElement) {
  const parallax = (selector: string, y: number) =>
    fromToAll(root, selector, { yPercent: y }, { yPercent: -y, ease: "none", scrollTrigger: scrub(root) });
  parallax("[data-collage]", 8);
  parallax("[data-daisy]", 12);
  parallax("[data-left]", 6);
  parallax("[data-square]", -10);

  const at = (start: string) => once(root, start);
  fromAll(root, "[data-pill]", { scaleY: 0, transformOrigin: "50% 100%", duration: 1.3, ease: "power3.out", scrollTrigger: at("top 70%") });
  fromAll(root, "[data-collage]", { opacity: 0, x: 80, duration: 1.2, ease: "power3.out", scrollTrigger: at("top 75%") });
  fromAll(root, "[data-left]", { opacity: 0, x: -60, duration: 1.2, ease: "power3.out", scrollTrigger: at("top 75%") });
  fromAll(root, "[data-square]", { scale: 0, rotate: 20, duration: 0.9, ease: "back.out(1.5)", scrollTrigger: at("top 65%") });
}
