import { expect, test } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./build.ts";

test("build writes _site from content and templates", () => {
  const root = mkdtempSync(join(tmpdir(), "cms-"));
  try {
    mkdirSync(join(root, "content/blog"), { recursive: true });
    mkdirSync(join(root, "templates"), { recursive: true });
    writeFileSync(
      join(root, "content/index.md"),
      "---\nsite:\n  title: T\n  baseUrl: ''\n---\nHome\n",
    );
    writeFileSync(
      join(root, "content/blog/hi.md"),
      "---\ntitle: Hi\ndate: 2026-01-01\n---\nyo\n",
    );
    writeFileSync(
      join(root, "templates/index.html"),
      "<h1>{{ site.title }}</h1>",
    );
    writeFileSync(
      join(root, "templates/blog.entry.html"),
      "<article>{{ title }}</article>",
    );
    writeFileSync(
      join(root, "templates/blog.list.html"),
      "{{#each entries}}{{ title }}{{/each}}",
    );

    build(root);

    expect(readFileSync(join(root, "_site/index.html"), "utf8")).toBe(
      "<h1>T</h1>",
    );
    expect(readFileSync(join(root, "_site/blog/hi/index.html"), "utf8")).toBe(
      "<article>Hi</article>",
    );
    expect(readFileSync(join(root, "_site/blog/index.html"), "utf8")).toBe(
      "Hi",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
