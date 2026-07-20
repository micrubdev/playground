import { expect, test } from "vitest";
import { renderTemplate } from "./template.ts";

test("escapes double-stache and passes triple-stache raw", () => {
  expect(renderTemplate("{{ a }} {{{ b }}}", { a: "<x>", b: "<y>" })).toBe(
    "&lt;x&gt; <y>",
  );
});

test("resolves dotted paths", () => {
  expect(renderTemplate("{{ site.title }}", { site: { title: "T" } })).toBe(
    "T",
  );
});

test("iterates arrays with each, spreading item fields", () => {
  const out = renderTemplate("{{#each items}}<i>{{ name }}</i>{{/each}}", {
    items: [{ name: "a" }, { name: "b" }],
  });
  expect(out).toBe("<i>a</i><i>b</i>");
});

test("branches on if/else by truthiness", () => {
  expect(renderTemplate("{{#if on}}Y{{else}}N{{/if}}", { on: false })).toBe(
    "N",
  );
});

test("expands partials against the current context", () => {
  expect(
    renderTemplate(
      "{{> nav }}",
      { title: "T" },
      { nav: "<h1>{{ title }}</h1>" },
    ),
  ).toBe("<h1>T</h1>");
});

test("renders nothing for non-primitive values and missing paths", () => {
  expect(renderTemplate("[{{ obj }}][{{ nope }}]", { obj: { a: 1 } })).toBe(
    "[][]",
  );
});

test("iterates scalar arrays via this", () => {
  expect(
    renderTemplate("{{#each tags}}#{{ this }} {{/each}}", { tags: ["a", "b"] }),
  ).toBe("#a #b ");
});

// Prettier reflows templates and can wrap a newline inside {{ }}, e.g. `{{#if\n
// next}}`. The keyword must still be recognized across arbitrary whitespace.
test("recognizes block tags split by newlines or extra spaces", () => {
  expect(renderTemplate("{{#if\n  on}}Y{{else}}N{{/if}}", { on: false })).toBe(
    "N",
  );
  expect(
    renderTemplate("{{#each\n items}}{{ name }}{{/each}}", {
      items: [{ name: "a" }],
    }),
  ).toBe("a");
});
