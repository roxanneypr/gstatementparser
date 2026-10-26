import { getCollection, type CollectionEntry } from "astro:content";
import { publishingErrors } from "../lib/blogRules.ts";

export type Post = CollectionEntry<"blog">;

/** Drafts are shown while developing so they can be reviewed, never in production builds. */
export const SHOW_DRAFTS = import.meta.env.DEV;

/** Posts to build/list, newest first. The build fails if a published post breaks the rules. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection("blog");
  const errors = publishingErrors(all);
  if (errors.length) throw new Error(errors.join("\n"));
  return all
    .filter((p) => SHOW_DRAFTS || !p.data.draft)
    .sort((a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime());
}

export const postUrl = (slug: string) => `/blog/${slug}`;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const displayDate = (d: Date) =>
  d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
