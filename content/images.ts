/**
 * Which photo goes where, plus its alt text.
 *
 * TO REPLACE A PHOTO: drop the new file into assets-src/images/ (same filename),
 * run `npm run images`, and update the alt text here. Ids are the filename
 * without the extension.
 *
 * NOTE: the gallery alt texts describe the CURRENT placeholder images (family
 * photo-book pages). Rewrite them when you swap in real work.
 *
 * Feed reels: videos come from `swift scripts/encode-reels.swift`, which also
 * writes each poster (reelN.jpg) into assets-src/images/.
 */
import type { ImageId } from "@/lib/generated/images";
import { reelVideos } from "./videos.generated";

export type Photo = { id: ImageId; alt: string };

/** Hero slides. With one slide the two arrows are decorative; add 2+ photos and they become working buttons. */
export const heroSlides: Photo[] = [
  { id: "hero-couple", alt: "A groom and bride sharing a quiet moment at their wedding" },
];

export const preShoots: Photo[] = [
  { id: "pre1", alt: "Photo-book page titled Forever grateful with family portraits" },
  { id: "pre2", alt: "Photo-book page titled The heart of everything with family photos and a dog" },
  { id: "pre3", alt: "Photo-book page titled Moments worth celebrating with a birthday cake and family" },
  { id: "pre4", alt: "Photo-book page titled A new chapter with childhood family photographs" },
  { id: "pre5", alt: "Photo-book page titled Where it all began with an older couple's photographs" },
  { id: "pre6", alt: "Photo-book page with a portrait of an older couple in front of an arched hall" },
  { id: "pre7", alt: "Photo-book table of contents page with family photos" },
  { id: "pre8", alt: "Photo-book cover titled A lifetime together showing an older couple in a garden" },
];

/** Tap-to-play reels. `label` names the video for screen readers (the poster itself is decorative). */
export const feedReels: { id: ImageId; video: string; label: string }[] = [
  { id: "reel1", video: reelVideos.reel1, label: "Roka reel 1: the bride's friends gathering around her" },
  { id: "reel2", video: reelVideos.reel2, label: "Roka reel 2: the bride's entry in a purple gown" },
  { id: "reel3", video: reelVideos.reel3, label: "Roka reel 3: the groom kneels with a bouquet" },
  { id: "reel4", video: reelVideos.reel4, label: "Roka reel 4: the ring exchange under the couple's monogram" },
  { id: "reel5", video: reelVideos.reel5, label: "Roka reel 5: family dancing and celebrating" },
];

export const qrAlt = "QR code to Reel Craft's latest work";
export const aboutPhoto: Photo = { id: "about-photo", alt: "A hand on a camera whose screen shows a group photograph" };
export const visualCollage: Photo = { id: "collage", alt: "Collage of framed photographs with dried-flower decor" };
export const visualLeft: Photo = { id: "collage-left", alt: "A couple dancing under string lights beside a vintage car" };
