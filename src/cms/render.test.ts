import { expect, test } from "vitest";
import { buildSiteModel } from "./site.ts";
import { renderSite } from "./render.ts";

const model = buildSiteModel([
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
    raw: "---\ntitle: Old\ndate: 2026-01-01\ntags: [x]\n---\nyo\n",
  },
]);

const templates = {
  "index.html": "<h1>{{ site.title }}</h1>",
  "page.html": "<title>{{ title }}</title>",
  "blog.entry.html": "<article>{{ title }}</article>",
  "blog.list.html": "{{#each entries}}<a>{{ title }}</a>{{/each}}",
  "blog.tag.html": "<h2>{{ tag }}</h2>",
};

test("emits home, page, entry, list, and tag files at the right paths", () => {
  const byPath = Object.fromEntries(
    renderSite(model, templates, {}).map((f) => [f.path, f.html]),
  );
  expect(byPath[""]).toBe("<h1>T</h1>");
  expect(byPath["about"]).toBe("<title>About</title>");
  expect(byPath["blog/hello"]).toBe("<article>Hello</article>");
  expect(byPath["blog"]).toBe("<a>Hello</a><a>Old</a>");
  expect(byPath["blog/tags/x"]).toBe("<h2>x</h2>");
});

test("throws when a required template is missing", () => {
  expect(() => renderSite(model, {}, {})).toThrow(
    "Missing template: templates/index.html",
  );
});

test("passes prev/next neighbours to collection entries", () => {
  const byPath = Object.fromEntries(
    renderSite(
      model,
      {
        ...templates,
        "blog.entry.html":
          "{{#if prev}}P:{{ prev.title }}{{/if}}{{#if next}}N:{{ next.title }}{{/if}}",
      },
      {},
    ).map((f) => [f.path, f.html]),
  );
  // Entries are newest-first: Hello (0) then Old (1).
  expect(byPath["blog/hello"]).toBe("N:Old");
  expect(byPath["blog/old"]).toBe("P:Hello");
});

test("gives list and tag pages a title for the head partial", () => {
  const byPath = Object.fromEntries(
    renderSite(
      model,
      {
        ...templates,
        "blog.list.html": "{{ title }}",
        "blog.tag.html": "{{ title }}",
      },
      {},
    ).map((f) => [f.path, f.html]),
  );
  expect(byPath["blog"]).toBe("blog");
  expect(byPath["blog/tags/x"]).toBe("x · blog");
});
