import type { CSSProperties } from "react";
import { STAR_PATH } from "./star";
import styles from "./Sparkle.module.css";

/** Four-point star that slowly spins and breathes (CSS animation, paused off-screen). */
export default function Sparkle({ size = 14, color = "var(--peach)", duration = 12 }: { size?: number; color?: string; duration?: number }) {
  return (
    <svg
      data-loop
      aria-hidden="true"
      focusable="false"
      className={styles.star}
      style={{ "--spin": `${duration}s` } as CSSProperties}
      width={size}
      height={size}
      viewBox="0 0 53 53"
      fill={color}
    >
      <path d={STAR_PATH} />
    </svg>
  );
}
