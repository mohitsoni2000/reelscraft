import Picture from "@/components/media/Picture";
import PlayButton from "@/components/ui/PlayButton";
import SectionHeading from "@/components/ui/SectionHeading";
import { feedCopy } from "@/content/copy";
import { feedReels } from "@/content/images";
import FeedReel from "./FeedReel";
import styles from "./Feed.module.css";

export default function Feed() {
  return (
    <section id="feed" aria-labelledby="feed-title" data-motion-root="feed" className={`section ${styles.feed}`}>
      <SectionHeading id="feed-title" accent={feedCopy.accent}>{feedCopy.lead}</SectionHeading>
      <div className={styles.grid}>
        {feedReels.map((reel) => (
          <FeedReel key={reel.id} src={reel.video} label={reel.label}>
            <Picture id={reel.id} alt="" sizes="(min-width: 900px) 300px, 45vw" className={styles.img} />
            <span className={styles.play}><PlayButton size={70} /></span>
          </FeedReel>
        ))}
      </div>
    </section>
  );
}
