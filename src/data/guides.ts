import { getCollection, type CollectionEntry } from "astro:content";

export type Guide = CollectionEntry<"guides">;

/** Drafts are shown while developing so they can be reviewed, never in production builds. */
export const SHOW_DRAFTS = import.meta.env.DEV;

/** Guides to build/list, newest first. Published guides are validated before they can ship. */
export async function getGuides(): Promise<Guide[]> {
  const all = await getCollection("guides");
  const slugs = new Set(all.map((g) => g.id));
  for (const g of all) {
    if (g.data.draft) continue;
    const body = g.body ?? "";
    if (/TODO/i.test(body)) {
      throw new Error(
        `Guide "${g.id}" is published but still has TODO markers. Verify them first.`,
      );
    }
    if (/^#\s/m.test(body)) {
      throw new Error(`Guide "${g.id}" has a "# " heading; the page title is the only <h1>.`);
    }
    for (const r of g.data.related) {
      if (!slugs.has(r)) throw new Error(`Guide "${g.id}" links to unknown related guide "${r}".`);
    }
  }
  return all
    .filter((g) => SHOW_DRAFTS || !g.data.draft)
    .sort((a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime());
}

export const guideUrl = (slug: string) => `/guides/${slug}`;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const displayDate = (d: Date) =>
  d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
