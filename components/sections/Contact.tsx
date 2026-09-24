import Picture from "@/components/media/Picture";
import ArrowIcon from "@/components/ui/ArrowIcon";
import SectionHeading from "@/components/ui/SectionHeading";
import { bookingSteps, contactCopy } from "@/content/copy";
import { qrAlt } from "@/content/images";
import { site } from "@/content/site";
import styles from "./Contact.module.css";

export default function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title" data-motion-root="contact" className={`section ${styles.contact}`}>
      <div data-pattern aria-hidden="true" className={styles.pattern} />
      <SectionHeading id="contact-title" font="poppins" accent={contactCopy.accent}>{contactCopy.lead}</SectionHeading>

      <div data-reveal className={`poppins ${styles.process}`}>
        <h3 className={styles.processTitle}>{contactCopy.processTitle}</h3>
        <ol className={styles.steps}>
          {bookingSteps.map((step, i) => (
            <li key={step} className={styles.stepItem}>
              <span data-step className={i === bookingSteps.length - 1 ? `${styles.step} ${styles.stepLast}` : styles.step}>{step}</span>
              {i < bookingSteps.length - 1 && <ArrowIcon width={28} color="var(--brown)" draw />}
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.stack}>
        <div className={styles.cards}>
          <a data-card href={site.phoneHref} className={`poppins ${styles.card}`}>
            <span className={styles.cardLabel}>{contactCopy.phoneLabel}</span>
            <span className={styles.cardValue}>{site.phone}</span>
          </a>
          <a data-card href={`mailto:${site.email}`} className={`poppins ${styles.card}`}>
            <span className={styles.cardLabel}>{contactCopy.emailLabel}</span>
            <span className={styles.cardValue}>{site.email}</span>
          </a>
          <a data-card href={site.instagramUrl} className={`poppins ${styles.card}`}>
            <span className={styles.cardLabel}>{contactCopy.instagramLabel}</span>
            <span className={styles.cardValue}>{site.instagram}</span>
          </a>
        </div>
        <div data-qr className={styles.qrCard}>
          <p className={`poppins ${styles.qrText}`}><span>{contactCopy.qrLead}</span><b>{contactCopy.qrStrong}</b></p>
          <div data-loop className={styles.qr}>
            <Picture id="qr" alt={qrAlt} sizes="129px" className={styles.qrImg} />
            <svg aria-hidden="true" focusable="false" viewBox="0 0 130 129" width="130" height="129" className={styles.qrSvg}>
              <rect data-qr-frame x="2" y="2" width="126" height="125" rx="6" fill="none" stroke="var(--peach)" strokeWidth="3" />
              <line className={styles.scan} x1="8" y1="10" x2="122" y2="10" stroke="var(--peach)" strokeWidth="2" opacity="0.8" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
