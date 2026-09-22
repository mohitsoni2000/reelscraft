import PlayIcon from "./PlayIcon";
import styles from "./PlayButton.module.css";

/**
 * Decorative play badge: the play icon inside a slowly rotating dashed ring (pure CSS).
 * It has no behaviour of its own: its parent link or card is the control.
 */
export default function PlayButton({ size = 100 }: { size?: number }) {
  const c = size / 2;
  return (
    <span data-loop aria-hidden="true" className={styles.play} style={{ width: size, height: size, margin: `-${c}px 0 0 -${c}px` }}>
      <svg className={styles.rings} viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className={styles.dash} cx={c} cy={c} r={size * 0.46} fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="4 8" opacity="0.9" />
      </svg>
      <PlayIcon size={size * 0.75} className={styles.icon} />
    </span>
  );
}
