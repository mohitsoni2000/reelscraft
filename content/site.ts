/**
 * Business identity. Edit contact details here; every page, the JSON-LD and the
 * sitemap read from this file.
 *
 * NEXT_PUBLIC_SITE_URL is inlined at build time (see docs/DEPLOY.md). Production
 * builds (`npm run build:deploy`) refuse to run without an https URL.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const site = {
  name: "Reel Craft",
  url: siteUrl,
  title: "Reel Craft — Your Wedding Reimagined in Reels",
  description:
    "Wedding reel management by Reel Craft: shoot-day coordination, cinematic edits and Instagram-ready reels delivered in 48-72 hours.",
  tagline: "Wedding Reel Management & Content Solutions",
  instagram: "@Reelcraft_01",
  instagramUrl: "https://instagram.com/Reelcraft_01",
  phone: "+91 9944883494",
  phoneHref: "tel:+919944883494",
  email: "reelcraft@gmail.com",
} as const;

/** Label of the call-to-action button in the header. */
export const navCta = "Contact Us";

export const nav = [
  { label: "About", href: "#about" },
  { label: "Our Services", href: "#services" },
  { label: "Price & Planning", href: "#pricing" },
] as const;
