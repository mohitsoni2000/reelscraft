import Button from "@/components/ui/Button";
import Logo from "@/components/ui/Logo";
import { nav, navCta } from "@/content/site";
import MobileMenu from "./MobileMenu";
import styles from "./Nav.module.css";

/** Page header (banner landmark). Below 640px the links collapse into MobileMenu. */
export default function Nav() {
  return (
    <header className={styles.header} data-motion-root="nav">
      <Logo />
      <MobileMenu links={nav} />
      <span data-nav className={styles.cta}>
        <Button href="#contact">{navCta}</Button>
      </span>
    </header>
  );
}
