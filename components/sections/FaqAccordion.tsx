"use client";
import { useId, useState } from "react";
import styles from "./Faq.module.css";

type Item = { q: string; a: string };

/** Accordion following the WAI-ARIA pattern: each question is a button inside a heading that controls its answer region. */
export default function FaqAccordion({ items }: { items: readonly Item[] }) {
  const [open, setOpen] = useState(0);
  const uid = useId();

  const toggle = (i: number) => {
    setOpen((current) => (current === i ? -1 : i));
    // The page height changes as the panel animates; ask MotionController to re-measure once it settles.
    window.setTimeout(() => window.dispatchEvent(new Event("layout-changed")), 500);
  };

  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const isOpen = i === open;
        const buttonId = `${uid}-q${i}`;
        const panelId = `${uid}-a${i}`;
        return (
          <div key={item.q} data-faq className={styles.item} data-open={isOpen}>
            <h3 className={styles.heading}>
              <button id={buttonId} type="button" className={styles.q} aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)}>
                <span>{item.q}</span>
                <svg aria-hidden="true" focusable="false" width="14" height="22" viewBox="0 0 14 22" fill="none" stroke="rgb(52,52,52)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={styles.chev}>
                  <path d="M 3 2 L 11 11 L 3 20" />
                </svg>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className={styles.a}>
              <p className={styles.aInner}><span>{item.a}</span></p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
