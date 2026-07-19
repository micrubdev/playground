import { expect, test } from "vitest";
import { renderInline } from "./markdown.ts";

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
