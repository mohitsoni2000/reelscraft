import { buildJsonLd } from "@/lib/seo/jsonld";

/** Structured data. The payload is static, trusted content; `<` is escaped so it can never close the tag. */
export default function JsonLd() {
  const json = JSON.stringify(buildJsonLd()).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
