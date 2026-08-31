import type { MetadataRoute } from "next";

/** Private app. Nothing here should ever appear in a search index. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
