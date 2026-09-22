"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./Nav.module.css";

type Link = { label: string; href: string };

/**
 * Primary navigation. On wide screens the links are always visible and the
 * toggle is hidden by CSS. Below 640px the toggle opens a panel; Escape or a
 * link click closes it (Escape returns focus to the toggle).
 */
export default function MobileMenu({ links }: { links: readonly Link[] }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button ref={toggle} type="button" className={styles.toggle} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
        <span className={styles.bars} aria-hidden="true" />
        <span className={styles.srOnly}>Menu</span>
      </button>
      <nav id="site-menu" aria-label="Primary" className={styles.nav} data-open={open}>
        {links.map((l) => (
          <a key={l.href} href={l.href} data-nav className={styles.link} onClick={() => setOpen(false)}>
            {l.label}
            <svg aria-hidden="true" focusable="false" className={styles.underline} width="100%" height="2" viewBox="0 0 100 2" preserveAspectRatio="none">
              <line x1="0" y1="1" x2="100" y2="1" stroke="var(--peach)" strokeWidth="2" pathLength="1" strokeDasharray="1" />
            </svg>
          </a>
        ))}
      </nav>
    </>
  );
}
