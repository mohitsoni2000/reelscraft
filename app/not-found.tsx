import type { Metadata } from "next";
import Button from "@/components/ui/Button";
import { notFoundCopy } from "@/content/copy";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Becomes out/404.html; the web server serves it for unknown URLs (see deploy/). */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className={styles.wrap}>
      <p className={`script brown ${styles.code}`}>404</p>
      <h1 className={`alt ${styles.title}`}>{notFoundCopy.title}</h1>
      <p className={styles.text}>{notFoundCopy.text}</p>
      <Button href="/">{notFoundCopy.back}</Button>
    </main>
  );
}
