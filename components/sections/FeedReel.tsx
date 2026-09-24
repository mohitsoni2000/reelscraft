"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Feed.module.css";

/** Only one reel plays at a time: starting one pauses every other video on the page. */
function pauseOthers(event: React.SyntheticEvent<HTMLVideoElement>) {
  document.querySelectorAll("video").forEach((video) => {
    if (video !== event.currentTarget) video.pause();
  });
}

/**
 * One feed card. Until it is tapped it is a button over the server-rendered
 * poster (`children`), and no video bytes are fetched. Tapping mounts a
 * <video> with native controls and sound that starts at once (the tap is the
 * user gesture that allows unmuted autoplay) and takes keyboard focus.
 * The poster stays underneath, so there is no black flash while the first
 * frame loads.
 */
export default function FeedReel({ src, label, children }: { src: string; label: string; children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (playing) videoRef.current?.focus();
  }, [playing]);

  return (
    <div data-card className={styles.card}>
      {children}
      {playing ? (
        <video
          ref={videoRef}
          src={src}
          aria-label={label}
          controls
          autoPlay
          playsInline
          controlsList="nodownload"
          onPlay={pauseOthers}
          className={styles.video}
        />
      ) : (
        <button type="button" aria-label={`Play ${label}`} onClick={() => setPlaying(true)} className={styles.trigger} />
      )}
    </div>
  );
}
