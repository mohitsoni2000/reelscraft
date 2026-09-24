import Picture from "@/components/media/Picture";
import CircleBadge from "@/components/ui/CircleBadge";
import PlayIcon from "@/components/ui/PlayIcon";
import { heroCopy } from "@/content/copy";
import { heroSlides } from "@/content/images";
import { site } from "@/content/site";
import HeroCarousel from "./HeroCarousel";
import styles from "./Hero.module.css";

// Size of the outline path below; the clip-path, badge and arrow positions are derived from it.
const PATH_W = 1337.682;
const PATH_H = 576.964;
const HERO_PATH = "M 1299.807 0 C 1320.724 0 1337.681 16.957 1337.682 37.874 L 1337.682 172.443 C 1337.682 187.718 1311.528 199.654 1296.253 199.654 C 1267.86 199.654 1244.843 222.671 1244.843 251.064 C 1244.843 279.458 1267.86 302.475 1296.253 302.476 C 1311.528 302.476 1337.682 314.411 1337.682 329.686 L 1337.682 539.089 C 1337.682 560.006 1320.724 576.964 1299.807 576.964 L 530.66 576.964 C 500.085 576.964 477.149 527.384 477.149 496.809 C 477.149 440.012 431.106 393.969 374.309 393.969 C 317.512 393.969 271.469 440.012 271.469 496.809 C 271.469 527.384 248.533 576.964 217.957 576.964 L 37.875 576.964 C 16.958 576.964 0 560.006 0 539.089 L 0 324.567 C 0 311.358 16.24 302.476 29.449 302.476 C 57.843 302.475 80.859 279.458 80.859 251.064 C 80.859 222.671 57.842 199.654 29.449 199.654 C 16.24 199.654 0 190.771 0 177.561 L 0 37.874 C 0 16.957 16.957 0 37.874 0 L 1299.807 0 Z";

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" data-motion-root="hero" className={styles.hero}>
      <h1 id="hero-title" className={styles.title}>
        <span className={styles.clip}><span data-line className={styles.l1}>{heroCopy.titleTop}</span></span>{" "}
        <span className={styles.clip}>
          <span data-line className={styles.l2}>{heroCopy.titleBottom}</span>
        </span>
      </h1>

      <HeroCarousel
        slides={heroSlides.map((slide, i) => (
          <Picture
            key={slide.id}
            id={slide.id}
            alt={slide.alt}
            sizes="(min-width: 1440px) 1340px, calc(100vw - 32px)"
            priority={i === 0}
            className={styles.img}
            data-img
          />
        ))}
      >
        <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${PATH_W} ${PATH_H}`} width="100%" height="100%" preserveAspectRatio="none" className={styles.outlineSvg}>
          <defs><clipPath id="rcHeroClip" clipPathUnits="objectBoundingBox"><path transform={`scale(${1 / PATH_W} ${1 / PATH_H})`} d={HERO_PATH} /></clipPath></defs>
          <path data-outline d={HERO_PATH} fill="none" stroke="var(--peach)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
        <span data-play className={styles.play}><PlayIcon className={styles.playIcon} /></span>
        <div data-badge className={styles.badgeSlot}>
          <CircleBadge />
        </div>
      </HeroCarousel>

      <div className={styles.meta}>
        <a data-meta href={site.instagramUrl} className={styles.insta}>
          <Picture id="insta" alt="" sizes="27px" className={styles.instaIcon} />
          <span>{heroCopy.instaCta}</span>
        </a>
        <p data-meta className={styles.tagline}>{site.tagline}</p>
      </div>
    </section>
  );
}
