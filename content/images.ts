/**
 * Which photo goes where, plus its alt text.
 *
 * TO REPLACE A PHOTO: drop the new file into assets-src/images/ (same filename),
 * run `npm run images`, and update the alt text here. Ids are the filename
 * without the extension.
 *
 * NOTE: the alt texts below describe the CURRENT placeholder images (the
 * gallery pages are family photo-book pages, the feed items are reel covers).
 * Rewrite them when you swap in real work.
 */
import type { ImageId } from "@/lib/generated/images";

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

export const feedReels: (Photo & { label: string })[] = [
  { id: "feed1", alt: "", label: "Watch reel 1 on Instagram: a groom and bride under fireworks" },
  { id: "feed2", alt: "", label: "Watch reel 2 on Instagram: a couple in red and ivory wedding attire" },
  { id: "feed3", alt: "", label: "Watch reel 3 on Instagram: a couple embracing at night" },
  { id: "feed4", alt: "", label: "Watch reel 4 on Instagram: bangled hands and a couple at the ceremony" },
];

export const qrAlt = "QR code to Reel Craft's latest work";
export const aboutPhoto: Photo = { id: "about-photo", alt: "A hand on a camera whose screen shows a group photograph" };
export const visualCollage: Photo = { id: "collage", alt: "Collage of framed photographs with dried-flower decor" };
export const visualLeft: Photo = { id: "collage-left", alt: "A couple dancing under string lights beside a vintage car" };
