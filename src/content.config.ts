import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    /** ≤ 60 chars: used as <title> and <h1>. */
    title: z.string().max(60),
    /** ≤ 155 chars: meta description and listing summary. */
    description: z.string().max(155),
    publishedDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    lang: z.enum(["en", "fil"]).default("en"),
    /** Drafts are visible in `npm run dev` only; never built, listed or put in the sitemap. */
    draft: z.boolean().default(true),
    /** Slugs of 1–2 related posts for internal linking. */
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
