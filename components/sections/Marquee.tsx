import Sparkle from "@/components/ui/Sparkle";
import { marqueeWords } from "@/content/copy";
import styles from "./Marquee.module.css";

/** Decorative ticker (hidden from assistive tech). Pure CSS: four identical groups, the track slides by half its width. */
export default function Marquee() {
  return (
    <div data-loop aria-hidden="true" className={`alt ${styles.marquee}`}>
      <div className={styles.track}>
        {[0, 1, 2, 3].map((group) => (
          <ul key={group} className={styles.group}>
            {marqueeWords.map((word) => (
              <li key={word} className={styles.item}>
                <span>{word}</span>
                <Sparkle size={14} duration={6} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
