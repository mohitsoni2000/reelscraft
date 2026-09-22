"use client";
import { useEffect } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { sectionMotion } from "@/lib/motion";
import { MQ } from "@/lib/motion/env";
import { galleryPin } from "@/lib/motion/gallery";
import { drawLines, drawPaths, reveal, revealHeadingLines } from "@/lib/motion/reveal";

/**
 * Renders nothing. After hydration it wires every GSAP animation, all behind
 * `prefers-reduced-motion: no-preference`: with reduced motion the
 * server-rendered page is left exactly as it is (fully visible, nothing moves).
 * Per-section code lives in lib/motion/; sections opt in via `data-motion-root`.
 */
export default function MotionController() {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add({ motion: MQ.motion, wide: MQ.wide }, (ctx) => {
      const { motion, wide } = ctx.conditions as { motion: boolean; wide: boolean };
      if (!motion) return;

      reveal(document);
      drawLines(document);
      drawPaths(document);
      revealHeadingLines(document);
      document.querySelectorAll<HTMLElement>("[data-motion-root]").forEach((root) => {
        sectionMotion[root.dataset.motionRoot ?? ""]?.(root);
      });

      const gallery = document.querySelector<HTMLElement>('[data-motion-root="gallery"]');
      if (wide && gallery) return galleryPin(gallery);
    });
    return () => mm.revert();
  }, []);

  useEffect(() => {
    // Decorative CSS loops only run while on screen (see app/motion.css).
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.setAttribute("data-inview", String(e.isIntersecting))),
      { rootMargin: "120px" },
    );
    document.querySelectorAll("[data-loop]").forEach((el) => io.observe(el));

    // Layout shifts after web fonts load or when a FAQ item opens: re-measure the triggers.
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 150);
    };
    document.fonts?.ready.then(refresh);
    window.addEventListener("layout-changed", refresh);
    return () => {
      io.disconnect();
      window.removeEventListener("layout-changed", refresh);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
