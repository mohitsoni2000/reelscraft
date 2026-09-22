import type { Metadata, Viewport } from "next";
import { Montserrat, Montserrat_Alternates, Oooh_Baby, Poppins, PT_Serif_Caption } from "next/font/google";
import { heroSlides } from "@/content/images";
import { site, siteUrl } from "@/content/site";
import "./globals.css";
import "./motion.css";
import "./generated-images.css";

// Only Montserrat draws the hero, so only it is preloaded. The rest are used below the fold and
// load on demand (still swap, no invisible text).
// Variable font: one file covers every weight used on the page (300-700).
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const montserratAlt = Montserrat_Alternates({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-montserrat-alt", preload: false });
// latin-ext carries the rupee sign (U+20B9); the browser only fetches it when a page uses it.
const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "700"], variable: "--font-poppins", preload: false });
const ooohBaby = Oooh_Baby({ subsets: ["latin"], weight: "400", variable: "--font-oooh-baby", preload: false });
const ptSerif = PT_Serif_Caption({ subsets: ["latin"], weight: "400", variable: "--font-pt-serif", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
    locale: "en_IN",
    images: [{ url: "/og/og.jpg", width: 1200, height: 630, alt: heroSlides[0].alt }],
  },
  twitter: { card: "summary_large_image", title: site.title, description: site.description, images: ["/og/og.jpg"] },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = [montserrat, montserratAlt, poppins, ooohBaby, ptSerif].map((f) => f.variable).join(" ");
  return (
    <html lang="en-IN" className={fonts}>
      <head>
        {/* Without JavaScript nothing can open the FAQ, so show every answer. */}
        <noscript>
          <style>{'[data-faq] [role="region"]{visibility:visible!important;grid-template-rows:1fr!important}'}</style>
        </noscript>
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
