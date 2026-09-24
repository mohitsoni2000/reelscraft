import Picture from "@/components/media/Picture";
import ArrowIcon from "@/components/ui/ArrowIcon";
import Button from "@/components/ui/Button";
import DrawLine from "@/components/ui/DrawLine";
import { about } from "@/content/copy";
import { aboutPhoto } from "@/content/images";
import styles from "./About.module.css";

export default function About() {
  return (
    <section id="about" aria-labelledby="about-title" data-motion-root="about" className={styles.about}>
      <div className={styles.grid}>
        <div data-visual className={styles.visual}>
          <Picture id={aboutPhoto.id} alt={aboutPhoto.alt} sizes="(min-width: 700px) 465px, 78vw" className={styles.photo} data-photo />
          <Picture id="about-frame" alt="" sizes="(min-width: 700px) 600px, 100vw" className={styles.frame} data-frame />
        </div>
        <div className={`poppins ${styles.copy}`}>
          <p data-reveal className={styles.eyebrow}>{about.eyebrow}</p>
          <h2 id="about-title" data-reveal className={styles.h2}>
            <span className={`script brown ${styles.scriptLine}`}>{about.headingScript}</span>
            <span className={styles.boldLine}>{about.headingBold}</span>
          </h2>
          <DrawLine maxWidth={470} />
          <p data-reveal className={styles.body}>{about.body}</p>
          <ul className={styles.list}>
            {about.points.map((point) => (
              <li key={point} data-item className={styles.item}>
                <svg aria-hidden="true" focusable="false" className={styles.tick} width="14" height="14" viewBox="0 0 14 14">
                  <path data-tick d="M 2 7.5 L 5.5 11 L 12 3.5" fill="none" stroke="var(--peach)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <span data-reveal><Button href="#contact" size="lg">{about.cta} <ArrowIcon nudge /></Button></span>
        </div>
      </div>
    </section>
  );
}
