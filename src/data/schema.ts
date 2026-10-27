// JSON-LD builders shared by pages.
import { SITE_NAME } from "../site.ts";

export function breadcrumbSchema(site: URL | undefined, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: new URL(item.path, site).href,
    })),
  };
}

export function organization(site: URL | undefined) {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: new URL("/", site).href,
    logo: { "@type": "ImageObject", url: new URL("/icon-512.png", site).href },
  };
}
