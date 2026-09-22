import Picture from "@/components/media/Picture";
import ArrowIcon from "@/components/ui/ArrowIcon";
import DrawLine from "@/components/ui/DrawLine";
import { galleryCopy } from "@/content/copy";
import { preShoots } from "@/content/images";
import styles from "./PreShootGallery.module.css";

/**
 * A native, swipeable scroll-snap strip by default. On wide screens with motion
 * allowed, MotionController pins the section and drives the track with the
 * page scroll instead (lib/motion/gallery.ts sets data-pinned while it does).
 */
export default function PreShootGallery() {
  return (
    <section data-motion-root="gallery" className={styles.wrap}>
      <div data-scroller className={styles.scroller} role="region" aria-label={galleryCopy.label} tabIndex={0}>
        <div data-track className={styles.track}>
          {preShoots.map((photo) => (
            <div key={photo.id} data-card className={styles.card}>
              <Picture id={photo.id} alt={photo.alt} sizes="(min-width: 900px) 366px, 62vw" className={styles.img} />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.ruleRow}>
        <div className={styles.rule}><DrawLine color="#000" width={1} fromCenter /></div>
        <h2 id="pre-title" data-reveal className={`script ${styles.caption}`}>
          {galleryCopy.caption} <ArrowIcon width={34} color="var(--peach)" nudge />
        </h2>
      </div>
    </section>
  );
}
