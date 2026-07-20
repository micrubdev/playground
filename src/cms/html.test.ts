import { expect, test } from "vitest";
import { escapeHtml } from "./html.ts";

test("escapes the html-significant characters", () => {
  expect(escapeHtml(`<a href="x">&</a>`)).toBe(
    "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
  );
});

test("leaves plain text untouched", () => {
  expect(escapeHtml("hello world")).toBe("hello world");
});
