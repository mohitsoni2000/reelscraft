import type { CSSProperties } from "react";
import styles from "./DrawLine.module.css";

type Props = { color?: string; width?: number; dashed?: boolean; maxWidth?: number | string; fromCenter?: boolean; delay?: number };

/** Horizontal rule that draws itself on scroll (see drawLines in lib/motion/reveal.ts). */
export default function DrawLine({ color = "var(--peach)", width = 4, dashed, maxWidth, fromCenter, delay = 0 }: Props) {
  const max = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={styles.line}
      style={max ? ({ "--max": max } as CSSProperties) : undefined}
      width="100%"
      height={width}
      viewBox={`0 0 1000 ${width}`}
      preserveAspectRatio="none"
    >
      <line
        data-draw-line
        data-from-center={fromCenter ? "true" : undefined}
        data-delay={delay || undefined}
        x1="0"
        y1={width / 2}
        x2="1000"
        y2={width / 2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? "8 10" : undefined}
      />
    </svg>
  );
}
