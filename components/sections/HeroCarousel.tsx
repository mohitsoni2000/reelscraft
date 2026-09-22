"use client";
import { useState, type ReactNode } from "react";
import styles from "./Hero.module.css";

const PREV_ICON = <svg aria-hidden="true" focusable="false" width="12" height="34.5" viewBox="0 0 12 34.5" fill="none" stroke="#000" strokeWidth="2"><path d="M 12 0 L 0 18.5 L 12 34.5" /></svg>;
const NEXT_ICON = <svg aria-hidden="true" focusable="false" width="12" height="34.5" viewBox="0 0 12 34.5" fill="none" stroke="#000" strokeWidth="2"><path d="M 0 0 L 12 18.5 L 0 34.5" /></svg>;

/**
 * The hero card. Slides are server-rendered <Picture>s passed in as `slides`;
 * `children` are the static overlays (outline, play badge, avatar).
 *
 * With two or more slides the arrows are real buttons that crossfade between
 * them (no autoplay). With a single slide there is nothing to switch to, so the
 * arrows are drawn as decorative, non-interactive shapes: they keep the card's
 * notches filled as in the design without adding dead controls for keyboard or
 * screen-reader users.
 */
export default function HeroCarousel({ slides, children }: { slides: ReactNode[]; children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const multiple = count > 1;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <div
      className={styles.carousel}
      {...(multiple ? { role: "group", "aria-roledescription": "carousel", "aria-label": "Featured wedding reels" } : {})}
    >
      <div data-card className={styles.card}>
        <div className={styles.clipBox} aria-live={multiple ? "polite" : undefined}>
          {slides.map((slide, i) => (
            <div
              key={i}
              className={styles.slide}
              data-active={i === index}
              {...(multiple
                ? { role: "group", "aria-roledescription": "slide", "aria-label": `${i + 1} of ${count}`, "aria-hidden": i === index ? undefined : true }
                : {})}
            >
              {slide}
            </div>
          ))}
          <div className={styles.shade} />
          {/* One-time light sweep across the card on page load, purely decorative (CSS-only, killed by prefers-reduced-motion). */}
          <span aria-hidden="true" className={styles.introSweep} />
        </div>
        {children}
      </div>
      {multiple ? (
        <>
          <button data-arrow type="button" className={`${styles.arrow} ${styles.prev}`} aria-label="Previous slide" onClick={() => go(-1)}>{PREV_ICON}</button>
          <button data-arrow type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Next slide" onClick={() => go(1)}>{NEXT_ICON}</button>
        </>
      ) : (
        <>
          <span data-arrow aria-hidden="true" className={`${styles.arrow} ${styles.prev} ${styles.inert}`}>{PREV_ICON}</span>
          <span data-arrow aria-hidden="true" className={`${styles.arrow} ${styles.next} ${styles.inert}`}>{NEXT_ICON}</span>
        </>
      )}
    </div>
  );
}
