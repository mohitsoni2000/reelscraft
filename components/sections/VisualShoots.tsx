import Picture from "@/components/media/Picture";
import CircleBadge from "@/components/ui/CircleBadge";
import { visualCopy } from "@/content/copy";
import { visualCollage, visualLeft } from "@/content/images";
import styles from "./VisualShoots.module.css";

export default function VisualShoots() {
  return (
    <section id="services" aria-labelledby="visual-title" data-motion-root="visual-shoots" className={styles.stage}>
      <Picture id={visualCollage.id} alt={visualCollage.alt} sizes="(min-width: 900px) 690px, 62vw" className={styles.collage} data-collage />
      <div data-pill className={styles.pill}><Picture id="daisy" alt="" sizes="140px" className={styles.pillImg} /></div>
      <Picture id="daisy" alt="" sizes="(min-width: 900px) 290px, 40vw" className={styles.daisy} data-daisy />
      <div data-left className={styles.left}><Picture id={visualLeft.id} alt={visualLeft.alt} sizes="(min-width: 900px) 470px, 62vw" className={styles.leftImg} /></div>
      <div data-square className={styles.square}>
        <CircleBadge textColor="var(--cream)" starColor="var(--cream)" />
      </div>
      <div className={styles.text}>
        <h2 id="visual-title" className={styles.h2}>
          <span data-reveal className={styles.visual}>{visualCopy.lead}</span>
          <span data-reveal className={`script brown ${styles.shoots}`}>{visualCopy.script}</span>
        </h2>
        <p data-reveal className={styles.sub}>{visualCopy.sub}</p>
        <p data-reveal className={styles.body}>{visualCopy.body}</p>
      </div>
    </section>
  );
}
