import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/site";

export const dynamic = "force-static"; // required for static export

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 }];
}
