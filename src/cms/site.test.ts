import { expect, test } from "vitest";
import { buildSiteModel } from "./site.ts";

const files = [
  {
    path: "index.md",
    raw: "---\nsite:\n  title: T\n  baseUrl: /b\n---\nHome\n",
  },
  { path: "about.md", raw: "---\ntitle: About\n---\nabout\n" },
  {
    path: "blog/hello.md",
    raw: "---\ntitle: Hello\ndate: 2026-01-02\ntags: [x]\n---\nhi\n",
  },
  {
    path: "blog/old.md",
    raw: "---\ntitle: Old\ndate: 2026-01-01\ntags: [x, y]\n---\nyo\n",
  },
];

test("reads site metadata from index.md", () => {
  expect(buildSiteModel(files).site).toEqual({
    title: "T",
    baseUrl: "/b",
    description: undefined,
  });
});

test("classifies pages and collections and builds urls", () => {
  const model = buildSiteModel(files);
  expect(model.pages.map((p) => p.url)).toEqual(["/b/about/"]);
  const blog = model.collections.blog!;
  expect(blog.entries.map((e) => e.slug)).toEqual(["hello", "old"]);
  expect(blog.entries[0]!.url).toBe("/b/blog/hello/");
});

test("indexes tags per collection", () => {
  const tags = buildSiteModel(files).tags.blog!;
  expect(Object.keys(tags)).toEqual(["x", "y"]);
  expect(tags.x!.map((e) => e.slug)).toEqual(["hello", "old"]);
});

test("orders same-day posts by slug regardless of input order", () => {
  const raw = (t: string) => `---\ntitle: ${t}\ndate: 2026-01-05\n---\n`;
  // Fed newest-slug-first to prove the tiebreak, not input order, decides.
  const model = buildSiteModel([
    { path: "index.md", raw: "---\nsite:\n  title: T\n  baseUrl: /b\n---\n" },
    { path: "blog/zeta.md", raw: raw("Zeta") },
    { path: "blog/alpha.md", raw: raw("Alpha") },
  ]);
  expect(model.collections.blog!.entries.map((e) => e.slug)).toEqual([
    "alpha",
    "zeta",
  ]);
});

test("excludes draft entries from pages, collections, and tags", () => {
  const model = buildSiteModel([
    ...files,
    { path: "wip.md", raw: "---\ntitle: WIP\ndraft: true\n---\nsoon\n" },
    {
      path: "blog/draft.md",
      raw: "---\ntitle: Draft\ndate: 2026-01-03\ntags: [x]\ndraft: true\n---\nnope\n",
    },
  ]);
  expect(model.pages.map((p) => p.slug)).toEqual(["about"]);
  expect(model.collections.blog!.entries.map((e) => e.slug)).toEqual([
    "hello",
    "old",
  ]);
  expect(model.tags.blog!.x!.map((e) => e.slug)).toEqual(["hello", "old"]);
});
