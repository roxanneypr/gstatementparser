import { describe, expect, it } from "vitest";
import { publishingErrors, type PostLike } from "../src/lib/blogRules.ts";

const post = (id: string, over: Partial<PostLike["data"]> = {}, body = "Hello"): PostLike => ({
  id,
  body,
  data: { draft: false, related: [], ...over },
});

describe("publishingErrors", () => {
  it("allows clean published posts and ignores drafts", () => {
    expect(
      publishingErrors([
        post("a", { related: ["b"] }, "See [b](/blog/b)."),
        post("b"),
        post("c", { draft: true }, "TODO: verify\n# Heading\n[x](/blog/nope)"),
      ]),
    ).toEqual([]);
  });

  it("blocks unverified facts, extra h1s and broken links in published posts", () => {
    const errors = publishingErrors([
      post("a", { related: ["missing", "d"] }, "TODO: verify the menu\n# Big\nSee [d](/blog/d)."),
      post("d", { draft: true }),
    ]);
    expect(errors).toEqual([
      'Post "a" is published but still has TODO markers. Verify them first.',
      'Post "a" has a "# " heading; the post title is the only <h1>.',
      'Post "a" links to unknown related post "missing".',
      'Post "a" links to related post "d", which is still a draft.',
      'Post "a" links to /blog/d, which isn\'t published.',
    ]);
  });
});
