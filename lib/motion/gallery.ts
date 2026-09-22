import { gsap } from "@/lib/gsap";
import { fromAll, once } from "./util";

/** Card entrance. Runs on every viewport (when motion is allowed). */
export function galleryEntrance(root: HTMLElement) {
  fromAll(root, "[data-card]", {
    y: 120,
    opacity: 0,
    stagger: 0.08,
    duration: 1,
    ease: "power3.out",
    // GSAP would otherwise leave inline scale/rotate/translate: none behind, which (being inline)
    // permanently overrides the CSS hover/active scale below — clearing them restores the
    // stylesheet's static per-card rotate too, with the same end rotation, so nothing visibly moves.
    clearProps: "all",
    scrollTrigger: once(root, "top 60%"),
  });
}

/**
 * Pin the section and scrub the track sideways. Only used on wide screens
 * with motion allowed; everywhere else the track is a native, swipeable
 * scroll-snap strip (see PreShootGallery.module.css). `data-pinned` tells
 * the CSS to stop being a scroller while the pin is active.
 */
export function galleryPin(root: HTMLElement) {
  const scroller = root.querySelector<HTMLElement>("[data-scroller]");
  const track = root.querySelector<HTMLElement>("[data-track]");
  if (!scroller || !track) return;

  root.dataset.pinned = "true";
  scroller.scrollLeft = 0; // a native swipe (e.g. iPad portrait) must not leak into the pinned layout
  scroller.tabIndex = -1; // it cannot scroll by keyboard while the page scroll drives it
  const distance = () => Math.max(0, track.scrollWidth - scroller.clientWidth);
  gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: root,
      start: "top top",
      end: () => "+=" + distance(),
      pin: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      // The pin adds scroll distance, so it must be measured before every trigger below it.
      refreshPriority: 1,
    },
  });
  return () => {
    delete root.dataset.pinned;
    scroller.tabIndex = 0;
  };
}
