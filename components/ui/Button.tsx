import type { ReactNode } from "react";
import styles from "./Button.module.css";

type Props = { href: string; children: ReactNode; size?: "md" | "lg" };

export default function Button({ href, children, size = "md" }: Props) {
  return (
    <a href={href} className={size === "lg" ? `${styles.btn} ${styles.lg}` : styles.btn}>
      {children}
    </a>
  );
}
