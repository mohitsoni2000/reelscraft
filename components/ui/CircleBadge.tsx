import { useId } from "react";
import { STAR_PATH } from "./star";
import styles from "./CircleBadge.module.css";

const RADIUS = 61; // text baseline radius in the 200-unit viewBox
const GAP = 12; // units left open between the end and the start of the sentence
const DEFAULT_TEXT = "“Beyond Pages, Beyond Expression";

type Props = {
  text?: string;
  /** Ring-text colour. Pick one that reads against whatever sits behind the badge (a light backdrop for Hero's white notch, cream for a dark disc). */
  textColor?: string;
  starColor?: string;
};

/**
 * Round badge: a sentence running clockwise around a circle (starting at 12
 * o'clock) with two sparkles in the middle. Fills its parent completely and
 * has no background of its own — the caller's own shape (Hero's card notch,
 * VisualShoots' black disc) shows through. Decorative.
 */
export default function CircleBadge({ text = DEFAULT_TEXT, textColor = "#000", starColor = "rgb(108, 104, 94)" }: Props) {
  const ringId = useId();
  const ring = `M 100 ${100 - RADIUS} a ${RADIUS} ${RADIUS} 0 1 1 -0.01 0`;
  return (
    <svg data-loop aria-hidden="true" focusable="false" className={styles.badge} viewBox="0 0 200 200">
      <defs>
        <path id={ringId} d={ring} />
      </defs>
      {/* Only the ring of text turns; the sparkles stay put in the middle. */}
      <g className={styles.spin}>
        <text className={styles.text} style={{ fill: textColor }}>
          <textPath href={`#${ringId}`} textLength={2 * Math.PI * RADIUS - GAP} lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      </g>
      <path className={styles.star} style={{ fill: starColor }} transform="translate(55.35 69.95) scale(0.915)" d={STAR_PATH} />
      <path className={styles.star} style={{ fill: starColor }} transform="translate(101 105.9) scale(0.385)" d={STAR_PATH} />
    </svg>
  );
}
