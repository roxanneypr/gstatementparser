// Publishing rules for blog posts. Pure so they can be unit-tested; enforced at build time.

export interface PostLike {
  id: string;
  body?: string;
  data: { draft: boolean; related: string[] };
}

/** Problems that must block a build. Drafts are exempt from content checks. */
export function publishingErrors(posts: PostLike[]): string[] {
  const errors: string[] = [];
  const ids = new Set(posts.map((p) => p.id));
  const published = new Set(posts.filter((p) => !p.data.draft).map((p) => p.id));
  for (const p of posts) {
    if (p.data.draft) continue;
    const body = p.body ?? "";
    if (/TODO/i.test(body)) {
      errors.push(`Post "${p.id}" is published but still has TODO markers. Verify them first.`);
    }
    if (/^#\s/m.test(body)) {
      errors.push(`Post "${p.id}" has a "# " heading; the post title is the only <h1>.`);
    }
    for (const r of p.data.related) {
      if (!ids.has(r)) errors.push(`Post "${p.id}" links to unknown related post "${r}".`);
      else if (!published.has(r)) {
        errors.push(`Post "${p.id}" links to related post "${r}", which is still a draft.`);
      }
    }
    for (const [, slug] of body.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)) {
      if (slug && !published.has(slug)) {
        errors.push(`Post "${p.id}" links to /blog/${slug}, which isn't published.`);
      }
    }
  }
  return errors;
}
