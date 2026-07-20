import { expect, test } from "vitest";
import { renderInline, renderMarkdown } from "./markdown.ts";

test("escapes html then renders bold, italic, and code", () => {
  expect(renderInline("**b** *i* `x<y>`", "")).toBe(
    "<strong>b</strong> <em>i</em> <code>x&lt;y&gt;</code>",
  );
});

test("rewrites root-relative links, leaves absolute ones", () => {
  expect(renderInline("[home](/) [ext](https://x.com)", "/base")).toBe(
    '<a href="/base/">home</a> <a href="https://x.com">ext</a>',
  );
});

test("renders images with a rewritten src", () => {
  expect(renderInline("![alt](/img.png)", "/b")).toBe(
    '<img src="/b/img.png" alt="alt">',
  );
});

test("renders headings, paragraphs, and unordered lists", () => {
  const html = renderMarkdown("# Title\n\npara text\n\n- a\n- b\n", "");
  expect(html).toContain("<h1>Title</h1>");
  expect(html).toContain("<p>para text</p>");
  expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
});

test("renders fenced code blocks with escaping", () => {
  expect(renderMarkdown("```\n<tag>\n```\n", "")).toBe(
    "<pre><code>&lt;tag&gt;</code></pre>",
  );
});

test("renders blockquotes and horizontal rules", () => {
  const html = renderMarkdown("> quoted\n\n---\n", "");
  expect(html).toContain("<blockquote>quoted</blockquote>");
  expect(html).toContain("<hr>");
});
