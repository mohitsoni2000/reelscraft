import Picture from "@/components/media/Picture";
import { site } from "@/content/site";
import styles from "./Footer.module.css";

/** Site footer (contentinfo landmark). The year is fixed when the site is built. */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <Picture id="insta" alt="" sizes="18px" className={styles.icon} />
      <a href={site.instagramUrl}>{site.instagram}</a>
      <span>· © {new Date().getFullYear()} {site.name}</span>
    </footer>
  );
}
