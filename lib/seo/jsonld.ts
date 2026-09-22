import { plans } from "@/content/copy";
import { site, siteUrl } from "@/content/site";

/** schema.org data for search engines. No street address is published because none is configured. */
export function buildJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: site.name,
        inLanguage: "en-IN",
      },
      {
        "@type": "ProfessionalService",
        "@id": `${siteUrl}/#business`,
        name: site.name,
        url: `${siteUrl}/`,
        description: site.description,
        image: `${siteUrl}/og/og.jpg`,
        telephone: site.phone,
        email: site.email,
        sameAs: [site.instagramUrl],
        makesOffer: plans.map((p) => ({
          "@type": "Offer",
          price: p.price,
          priceCurrency: "INR",
          itemOffered: {
            "@type": "Service",
            name: `${p.name} wedding reel package`,
            description: `${p.coverage} — ${p.reels}`,
          },
        })),
      },
    ],
  };
}
