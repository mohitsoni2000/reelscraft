/** All page copy: section headings and labels, about, FAQ, plans, add-ons. Edit text here. */

export const about = {
  eyebrow: "About Us",
  headingScript: "Shooting Through",
  headingBold: "Vision & Expression",
  cta: "Get Your Reel Shoot Now",
  intro: [
    "Reelcraft ek dedicated wedding reel management company hai — hum aapki shaadi ke har moment ko scroll-stopping reels mein badalte hain.",
    "Kya karte hain: shooting coordination se lekar cinematic editing tak, poora reel pipeline hum manage karte hain.",
  ],
  points: [
    "Fast turnaround (48-72 hrs delivery)",
    "Multi-vendor footage sync (photographer/videographer ke saath coordination)",
    "Instagram & YouTube optimized formats",
    "Trending audio + storytelling-based edits",
  ],
};

export const marqueeWords = [
  "Reels for Weddings",
  "Engagements",
  "Haldi & More",
  "48-72 hr delivery",
  "Cinematic edits",
  "Trending audio",
];

export const faqs = [
  { q: "How fast do we get our reels?", a: "Standard delivery is 48-72 hours after the shoot. Same-day edits are available as an add-on." },
  { q: "Do you work with our own photographer and videographer?", a: "Yes. We coordinate with your existing vendors, sync all footage, and manage the full reel pipeline from shoot to final edit." },
  { q: "Which formats do you deliver?", a: "Instagram and YouTube optimized vertical formats, trending audio synced, ready to post." },
  { q: "How do we book a slot?", a: "Book your slot, pay the advance, and we handle shoot-day coordination. Reels are delivered within 48-72 hours." },
];

export type Plan = {
  name: string;
  /** What's covered, e.g. "Full wedding" or "Haldi + Sangeet (2 events)". */
  coverage: string;
  /** Total reel count for the package, e.g. "15-20 reels + teaser". */
  reels: string;
  /** Rupees, formatted with Indian digit grouping at render time. */
  price: number;
  /** One-line positioning note shown on the card. */
  role: string;
  tone: "plain" | "cream" | "blush" | "peach";
  popular?: boolean;
};

export const plans: Plan[] = [
  { name: "Starter", coverage: "1 event", reels: "5-6 reels", price: 9999, role: "Entry plan to get enquiries", tone: "plain" },
  { name: "Classic", coverage: "Haldi + Sangeet (2 events)", reels: "10-15 reels", price: 21999, role: "Good for mid budgets", tone: "blush" },
  { name: "Signature", coverage: "Full wedding", reels: "15-20 reels + teaser", price: 44999, role: "Your hero plan", tone: "cream", popular: true },
  { name: "Elite", coverage: "Full wedding + pre-shoots", reels: "30+ reels", price: 79999, role: "Premium anchor", tone: "peach" },
];

export type Addon = { name: string; price: string };

export const addons: Addon[] = [
  { name: "Same-day edit", price: "₹4,000–6,000" },
  { name: "Extra reel", price: "₹1,200–1,500" },
  { name: "Extra function", price: "₹6,000–8,000" },
  { name: "Drone coverage", price: "₹3,000–5,000" },
  { name: "Save-the-date reel", price: "₹4,000–6,000" },
  { name: "Pre-wedding reel", price: "₹8,000–12,000" },
  { name: "24-hour rush delivery", price: "₹2,000" },
  { name: "Outstation travel", price: "Actual travel & stay cost" },
];

export const bookingSteps = ["Book Your Slot", "Pay Advance", "Shoot day coordination", "Delivery in 48-72 hrs"];

/** Section headings and small labels (the words around the data above). */
export const heroCopy = { titleTop: "Your Wedding", titleBottom: "Reimagined in Reels" };

export const visualCopy = {
  lead: "Visual",
  script: "Shoots",
  sub: "A collection of raw moments",
  body: "creative frames, and timeless captures beyond the pages of Reelcraft",
};

export const galleryCopy = { label: "Pre-wedding photo gallery", caption: "Scroll to view lovely Pre Shoot" };

export const feedCopy = { lead: "From the", accent: "Feed" };

export const faqCopy = { eyebrow: "What Our Clients Ask", lead: "Frequently Asked", accent: "Questions" };

export const pricingCopy = {
  lead: "Plans &",
  accent: "Pricing",
  sub: "Wedding Service Package",
  addonsTitle: "You can add:",
  packageKicker: "Wedding Package",
  perSuffix: "/-",
};

export const contactCopy = {
  lead: "Contact &",
  accent: "Booking",
  processTitle: "Booking process",
  phoneLabel: "Phone",
  emailLabel: "Gmail",
  qrLead: "Scan to see our",
  qrStrong: "Latest Work",
};

export const notFoundCopy = {
  title: "This page isn't here",
  text: "The link may be old or mistyped. Let's get you back to the reels.",
  back: "Back to home",
};
