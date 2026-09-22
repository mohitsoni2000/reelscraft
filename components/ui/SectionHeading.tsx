import type { ReactNode } from "react";
import styles from "./SectionHeading.module.css";

type Props = { eyebrow?: string; children: ReactNode; accent?: ReactNode; font?: "montserrat" | "poppins"; id?: string };

/** "From the <Feed>" style heading: bold lead + serif brown accent. The line slides up from behind a clipped mask on scroll (see revealHeadingLines). */
export default function SectionHeading({ eyebrow, children, accent, font = "montserrat", id }: Props) {
  const poppins = font === "poppins";
  return (
    <div className={styles.wrap}>
      {eyebrow && <p data-reveal className={styles.eyebrow}>{eyebrow}</p>}
      <h2 id={id} className={poppins ? `poppins ${styles.title} ${styles.light}` : styles.title}>
        <span className={styles.clip}>
          <span data-heading-line className={styles.line}>
            {children}
            {accent && <> <span className={poppins ? `brown ${styles.accentMedium}` : `serif brown ${styles.accentRegular}`}>{accent}</span></>}
          </span>
        </span>
      </h2>
    </div>
  );
}
