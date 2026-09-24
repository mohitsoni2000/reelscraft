import { about } from "./about";
import { contact } from "./contact";
import { galleryEntrance } from "./gallery";
import { hero, nav } from "./hero";
import { faq, feed } from "./sections";
import { visualShoots } from "./visual-shoots";

/**
 * One entry per `data-motion-root="<id>"` element in the markup.
 * To animate a new section: give its root that attribute and add it here.
 */
export const sectionMotion: Record<string, (root: HTMLElement) => void> = {
  nav,
  hero,
  about,
  "visual-shoots": visualShoots,
  gallery: galleryEntrance,
  feed,
  faq,
  contact,
};
