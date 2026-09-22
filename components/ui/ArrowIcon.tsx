import styles from "./ArrowIcon.module.css";

type Props = { width?: number; color?: string; nudge?: boolean; draw?: boolean };

/** Right arrow. `nudge` = idle back-and-forth (CSS); `draw` = stroke-draw on scroll (MotionController). */
export default function ArrowIcon({ width = 26, color = "#000", nudge, draw }: Props) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={styles.arrow}
      width={width}
      height={(width * 16) / 26}
      viewBox="0 0 26 16"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M 1 8 H 24 M 17 1.5 L 24 8 L 17 14.5"
        className={nudge ? styles.nudge : undefined}
        data-loop={nudge ? "" : undefined}
        data-draw-path={draw ? "" : undefined}
      />
    </svg>
  );
}
