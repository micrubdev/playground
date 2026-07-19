# Zero-dependency SSG + headless content model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-runtime-dependency static site generator in this repo that turns Markdown + `{{ }}` templates into a static site, built and deployed to GitHub Pages by CI on every push to `main`.

**Architecture:** Functional core, imperative shell. Pure functions do all parsing and rendering (`html`, `frontmatter`, `markdown`, `template`, `site`, `render`); the only side effects (filesystem reads/writes, `console`) live in `build.ts` and the entry point `src/index.ts`. Data flows one way: raw files → site model → list of output files → disk.

**Tech Stack:** TypeScript run directly by Node via type stripping (no build step for the tool itself), Vitest, Node built-ins only (`node:fs`, `node:path`, `node:os`). No runtime dependencies.

## Global Constraints

Copied verbatim from the spec and repo (`CLAUDE.md`). Every task's requirements include these:

- **Zero runtime dependencies.** Node built-ins only. Nothing added to `dependencies`.
- **Type stripping only:** no enums, namespaces, or parameter properties (`erasableSyntaxOnly`). Use union types / `as const`.
- **Relative imports carry the literal `.ts` extension** (`import { x } from "./y.ts"`). The `.js` form typechecks but fails at runtime.
- **`verbatimModuleSyntax`:** import types with `import type { ... }`.
- **`noUncheckedIndexedAccess`:** indexed access yields `T | undefined`; guard or assert with `!`.
- **Entry-point side effects guarded by `import.meta.main`.**
- **Functional paradigm:** no classes; functions are referentially transparent (same input → same output, no external effects). Prefer `map`/`filter`/`reduce`/`flatMap`. Local mutable accumulators _inside_ a pure function are fine; filesystem/`console` effects live only in `build.ts` and `src/index.ts`.
- **New `.ts` files** go under `src/` (already covered by `tsconfig.json`'s `include: ["src", ...]` and Vitest's `src/**/*.test.ts`).
- **Node version floor 26** (`.nvmrc`); `@types/node` tracks v24.
- **Output goes to `_site/`**, which is gitignored and never committed. GitHub Pages publishes it as an Actions artifact.
- **Green `npm run check`** (format + lint + typecheck + test + build) is the source of truth. The pre-commit hook (`.husky/pre-commit`) runs lint-staged + `lint` + `typecheck` + `test` — **not** `build` or `format:check` — so intermediate commits made before `templates/` exists still pass, and lint-staged auto-formats staged files at commit time.

---

## File Structure

Pure core:

- `src/cms/html.ts` — `escapeHtml`.
- `src/cms/frontmatter.ts` — `parseFrontmatter` (splits `---` block, parses YAML subset).
- `src/cms/markdown.ts` — `renderInline`, `renderMarkdown` (Markdown subset → HTML).
- `src/cms/template.ts` — `renderTemplate` (`{{ }}` engine) + `Context`, `Partials` types.
- `src/cms/site.ts` — `buildSiteModel` + `SiteMeta`, `Entry`, `Collection`, `SiteModel`, `RawFile` types.
- `src/cms/render.ts` — `renderSite` (site model + templates → `OutputFile[]`) + `OutputFile` type.

Imperative shell:

- `src/cms/build.ts` — `loadContent`, `loadTemplates`, `writeSite`, `build` (the only fs I/O).
- `src/index.ts` — entry point; `import.meta.main`-guarded call to `build`.

Content & config:

- `content/`, `templates/`, `templates/partials/` — authored site source (Task 9).
- `.gitignore`, `.prettierignore`, `eslint.config.js`, `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`, `README.md` — modified.
- `docs/` — deleted (Task 9).

---

## Task 1: Foundation — `escapeHtml` and ignore `_site/`

**Files:**

- Create: `src/cms/html.ts`
- Test: `src/cms/html.test.ts`
- Modify: `.gitignore`, `.prettierignore`, `eslint.config.js`

**Interfaces:**

- Produces: `escapeHtml(value: string): string` — escapes `&`, `<`, `>`, `"`.

- [ ] **Step 1: Write the failing test**

`src/cms/html.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cms/html.test.ts`
Expected: FAIL — cannot find module `./html.ts`.

- [ ] **Step 3: Write minimal implementation**

`src/cms/html.ts`:

```ts
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Ignore the build output in the three tool configs**

Add `_site/` to `.gitignore` (append a line), to `.prettierignore` (append a line), and to the eslint ignore list. In `eslint.config.js` change:

```js
  globalIgnores(["node_modules/", "dist/"]),
```

to:

```js
  globalIgnores(["node_modules/", "dist/", "_site/"]),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/cms/html.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/cms/html.ts src/cms/html.test.ts .gitignore .prettierignore eslint.config.js
git commit -m "feat: add escapeHtml and ignore _site output"
```

---

## Task 2: Frontmatter parser

**Files:**

- Create: `src/cms/frontmatter.ts`
- Test: `src/cms/frontmatter.test.ts`

**Interfaces:**

- Produces:
  - `interface Frontmatter { data: Record<string, unknown>; body: string }`
  - `parseFrontmatter(raw: string): Frontmatter` — splits a leading `---` fenced block, parses the YAML subset (scalars: string/number/boolean/null; nested maps by 2-space indent; block lists `- x`; inline lists `[a, b]`). No frontmatter → `{ data: {}, body: raw }`.

- [ ] **Step 1: Write the failing tests**

`src/cms/frontmatter.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseFrontmatter } from "./frontmatter.ts";

test("splits frontmatter from body", () => {
  const { data, body } = parseFrontmatter("---\ntitle: Hi\n---\n# Body\n");
  expect(data).toEqual({ title: "Hi" });
  expect(body).toBe("# Body\n");
});

test("returns empty data when there is no frontmatter", () => {
  expect(parseFrontmatter("# Body")).toEqual({ data: {}, body: "# Body" });
});

test("coerces scalar types", () => {
  const { data } = parseFrontmatter(
    "---\nn: 3\nb: true\nx: ~\ns: hello\n---\n",
  );
  expect(data).toEqual({ n: 3, b: true, x: null, s: "hello" });
});

test("parses nested maps and both list forms", () => {
  const { data } = parseFrontmatter(
    "---\nsite:\n  title: T\n  baseUrl: /b\ntags: [a, b]\nmore:\n  - x\n  - y\n---\n",
  );
  expect(data.site).toEqual({ title: "T", baseUrl: "/b" });
  expect(data.tags).toEqual(["a", "b"]);
  expect(data.more).toEqual(["x", "y"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/frontmatter.test.ts`
Expected: FAIL — cannot find module `./frontmatter.ts`.

- [ ] **Step 3: Write minimal implementation**

`src/cms/frontmatter.ts`:

```ts
export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

interface Line {
  indent: number;
  text: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const lines = toLines(match[1] ?? "");
  const cursor = { n: 0 };
  const data = lines.length ? parseMap(lines, cursor, lines[0]!.indent) : {};
  return { data, body: raw.slice(match[0].length) };
}

function toLines(src: string): Line[] {
  return src
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
}

function parseMap(
  lines: Line[],
  cursor: { n: number },
  indent: number,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  while (cursor.n < lines.length) {
    const line = lines[cursor.n]!;
    if (line.indent !== indent) break;
    const colon = line.text.indexOf(":");
    const key = line.text.slice(0, colon).trim();
    const rest = line.text.slice(colon + 1).trim();
    cursor.n++;
    if (rest !== "") {
      map[key] = parseScalar(rest);
      continue;
    }
    const next = lines[cursor.n];
    if (next && next.indent > indent && next.text.startsWith("- ")) {
      map[key] = parseList(lines, cursor, next.indent);
    } else if (next && next.indent > indent) {
      map[key] = parseMap(lines, cursor, next.indent);
    } else {
      map[key] = null;
    }
  }
  return map;
}

function parseList(
  lines: Line[],
  cursor: { n: number },
  indent: number,
): unknown[] {
  const list: unknown[] = [];
  while (cursor.n < lines.length) {
    const line = lines[cursor.n]!;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;
    list.push(parseScalar(line.text.slice(2)));
    cursor.n++;
  }
  return list;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => parseScalar(s));
  }
  return v.replace(/^["']|["']$/g, "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/frontmatter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cms/frontmatter.ts src/cms/frontmatter.test.ts
git commit -m "feat: add frontmatter parser with YAML subset"
```

---

## Task 3: Markdown inline renderer

**Files:**

- Create: `src/cms/markdown.ts`
- Test: `src/cms/markdown.test.ts`

**Interfaces:**

- Consumes: `escapeHtml` from `./html.ts`.
- Produces: `renderInline(text: string, baseUrl: string): string` — escapes HTML, then renders `` `code` ``, `![alt](src)`, `[label](href)`, `**bold**`, `*italic*`. Root-relative URLs (starting `/`) are prefixed with `baseUrl`.

- [ ] **Step 1: Write the failing tests**

`src/cms/markdown.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/markdown.test.ts`
Expected: FAIL — `renderInline` is not exported.

- [ ] **Step 3: Write minimal implementation**

`src/cms/markdown.ts`:

```ts
import { escapeHtml } from "./html.ts";

export function renderInline(text: string, baseUrl: string): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00${codes.length - 1}\x00`;
  });
  s = escapeHtml(s);
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt: string, src: string) =>
      `<img src="${rewrite(src, baseUrl)}" alt="${alt}">`,
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, href: string) =>
      `<a href="${rewrite(href, baseUrl)}">${label}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s.replace(/\x00(\d+)\x00/g, (_m, n: string) => codes[Number(n)] ?? "");
}

function rewrite(url: string, baseUrl: string): string {
  return url.startsWith("/") ? `${baseUrl}${url}` : url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/markdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cms/markdown.ts src/cms/markdown.test.ts
git commit -m "feat: add markdown inline renderer"
```

---

## Task 4: Markdown block renderer

**Files:**

- Modify: `src/cms/markdown.ts` (add `renderMarkdown` + helper)
- Test: `src/cms/markdown.test.ts` (add cases)

**Interfaces:**

- Consumes: `renderInline`, `escapeHtml`.
- Produces: `renderMarkdown(src: string, baseUrl: string): string` — block-level parse of headings, paragraphs, `-`/`1.` lists, fenced code, `>` blockquotes, `---` rules; inline handled by `renderInline`.

- [ ] **Step 1: Write the failing tests**

Append to `src/cms/markdown.test.ts`:

````ts
import { renderMarkdown } from "./markdown.ts";

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
````

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/markdown.test.ts`
Expected: FAIL — `renderMarkdown` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/cms/markdown.ts`:

````ts
export function renderMarkdown(src: string, baseUrl: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(
        `<h${level}>${renderInline(heading[2]!.trim(), baseUrl)}</h${level}>`,
      );
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push("<hr>");
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        buf.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote>${renderInline(buf.join(" "), baseUrl)}</blockquote>`,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      out.push(
        renderList(
          lines,
          () => i,
          (n) => (i = n),
          /^[-*]\s+/,
          "ul",
          baseUrl,
        ),
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      out.push(
        renderList(
          lines,
          () => i,
          (n) => (i = n),
          /^\d+\.\s+/,
          "ol",
          baseUrl,
        ),
      );
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !isBlockStart(lines[i] ?? "")
    ) {
      buf.push(lines[i] ?? "");
      i++;
    }
    out.push(`<p>${renderInline(buf.join(" ").trim(), baseUrl)}</p>`);
  }
  return out.join("\n");
}

function renderList(
  lines: string[],
  get: () => number,
  set: (n: number) => void,
  marker: RegExp,
  tag: "ul" | "ol",
  baseUrl: string,
): string {
  const items: string[] = [];
  let i = get();
  while (i < lines.length && marker.test(lines[i] ?? "")) {
    items.push(
      `<li>${renderInline((lines[i] ?? "").replace(marker, ""), baseUrl)}</li>`,
    );
    i++;
  }
  set(i);
  return `<${tag}>${items.join("")}</${tag}>`;
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("```") ||
    /^#{1,6}\s/.test(line) ||
    line.startsWith(">") ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line.trim())
  );
}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/markdown.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/cms/markdown.ts src/cms/markdown.test.ts
git commit -m "feat: add markdown block renderer"
```

---

## Task 5: Template engine

**Files:**

- Create: `src/cms/template.ts`
- Test: `src/cms/template.test.ts`

**Interfaces:**

- Consumes: `escapeHtml` from `./html.ts`.
- Produces:
  - `type Context = Record<string, unknown>`
  - `type Partials = Record<string, string>`
  - `renderTemplate(tpl: string, ctx: Context, partials?: Partials): string` — supports `{{ path }}` (escaped), `{{{ path }}}` (raw), `{{#each items}}…{{/each}}` (item spread into scope; `@index` available), `{{#if path}}…{{else}}…{{/if}}`, `{{> name}}` partials, dotted paths. Missing paths render empty / falsy.

- [ ] **Step 1: Write the failing tests**

`src/cms/template.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/template.test.ts`
Expected: FAIL — cannot find module `./template.ts`.

- [ ] **Step 3: Write minimal implementation**

`src/cms/template.ts`:

```ts
import { escapeHtml } from "./html.ts";

export type Context = Record<string, unknown>;
export type Partials = Record<string, string>;

type Token =
  | { t: "text"; v: string }
  | { t: "var"; path: string; raw: boolean }
  | { t: "open"; kind: "each" | "if"; path: string }
  | { t: "else" }
  | { t: "close" }
  | { t: "partial"; name: string };

type Node =
  | { type: "text"; value: string }
  | { type: "var"; path: string; raw: boolean }
  | { type: "partial"; name: string }
  | { type: "each"; path: string; body: Node[] }
  | { type: "if"; path: string; body: Node[]; alt: Node[] };

export function renderTemplate(
  tpl: string,
  ctx: Context,
  partials: Partials = {},
): string {
  const [nodes] = parseNodes(tokenize(tpl), 0);
  return renderNodes(nodes, ctx, partials);
}

function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  const re = /\{\{\{(.*?)\}\}\}|\{\{(.*?)\}\}/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m.index > last) tokens.push({ t: "text", v: tpl.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      tokens.push({ t: "var", path: m[1].trim(), raw: true });
      continue;
    }
    const inner = (m[2] ?? "").trim();
    if (inner.startsWith("#each "))
      tokens.push({ t: "open", kind: "each", path: inner.slice(6).trim() });
    else if (inner.startsWith("#if "))
      tokens.push({ t: "open", kind: "if", path: inner.slice(4).trim() });
    else if (inner === "else") tokens.push({ t: "else" });
    else if (inner.startsWith("/")) tokens.push({ t: "close" });
    else if (inner.startsWith(">"))
      tokens.push({ t: "partial", name: inner.slice(1).trim() });
    else tokens.push({ t: "var", path: inner, raw: false });
  }
  if (last < tpl.length) tokens.push({ t: "text", v: tpl.slice(last) });
  return tokens;
}

function parseNodes(tokens: Token[], start: number): [Node[], number] {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const tk = tokens[i]!;
    if (tk.t === "close" || tk.t === "else") return [nodes, i];
    if (tk.t === "text") {
      nodes.push({ type: "text", value: tk.v });
      i++;
    } else if (tk.t === "var") {
      nodes.push({ type: "var", path: tk.path, raw: tk.raw });
      i++;
    } else if (tk.t === "partial") {
      nodes.push({ type: "partial", name: tk.name });
      i++;
    } else if (tk.t === "open" && tk.kind === "each") {
      const [body, j] = parseNodes(tokens, i + 1);
      nodes.push({ type: "each", path: tk.path, body });
      i = j + 1;
    } else if (tk.t === "open" && tk.kind === "if") {
      const [body, j] = parseNodes(tokens, i + 1);
      let alt: Node[] = [];
      let k = j;
      if (tokens[j]?.t === "else") {
        const [altNodes, jj] = parseNodes(tokens, j + 1);
        alt = altNodes;
        k = jj;
      }
      nodes.push({ type: "if", path: tk.path, body, alt });
      i = k + 1;
    } else {
      i++;
    }
  }
  return [nodes, i];
}

function renderNodes(nodes: Node[], ctx: Context, partials: Partials): string {
  return nodes.map((n) => renderNode(n, ctx, partials)).join("");
}

function renderNode(node: Node, ctx: Context, partials: Partials): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "var": {
      const v = resolve(node.path, ctx);
      const s = v == null ? "" : String(v);
      return node.raw ? s : escapeHtml(s);
    }
    case "partial":
      return renderTemplate(partials[node.name] ?? "", ctx, partials);
    case "each": {
      const list = resolve(node.path, ctx);
      if (!Array.isArray(list)) return "";
      return list
        .map((item, index) =>
          renderNodes(
            node.body,
            {
              ...ctx,
              this: item,
              "@index": index,
              ...(isObject(item) ? item : {}),
            },
            partials,
          ),
        )
        .join("");
    }
    case "if": {
      const v = resolve(node.path, ctx);
      const truthy = Array.isArray(v) ? v.length > 0 : Boolean(v);
      return renderNodes(truthy ? node.body : node.alt, ctx, partials);
    }
  }
}

function resolve(path: string, ctx: Context): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    return isObject(acc) ? acc[key] : undefined;
  }, ctx);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/template.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cms/template.ts src/cms/template.test.ts
git commit -m "feat: add mustache-style template engine"
```

---

## Task 6: Site model

**Files:**

- Create: `src/cms/site.ts`
- Test: `src/cms/site.test.ts`

**Interfaces:**

- Consumes: `parseFrontmatter` from `./frontmatter.ts`, `renderMarkdown` from `./markdown.ts`.
- Produces:
  - `interface SiteMeta { title: string; description?: string; baseUrl: string }`
  - `interface Entry { collection: string; slug: string; url: string; data: Record<string, unknown>; date?: string; tags: string[]; bodyHtml: string }`
  - `interface Collection { id: string; entries: Entry[] }`
  - `interface SiteModel { site: SiteMeta; home: Entry; pages: Entry[]; collections: Record<string, Collection>; tags: Record<string, Record<string, Entry[]>> }`
  - `interface RawFile { path: string; raw: string }` — `path` is relative to `content/`, forward-slashed (e.g. `blog/hello.md`).
  - `buildSiteModel(files: RawFile[]): SiteModel` — pure. `index.md` → home + `site` meta; top-level `*.md` → pages; subfolder `*.md` → collections; entries sorted date-desc (undated last, then slug); per-collection tag index.

- [ ] **Step 1: Write the failing tests**

`src/cms/site.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/site.test.ts`
Expected: FAIL — cannot find module `./site.ts`.

- [ ] **Step 3: Write minimal implementation**

`src/cms/site.ts`:

```ts
import { parseFrontmatter } from "./frontmatter.ts";
import { renderMarkdown } from "./markdown.ts";

export interface SiteMeta {
  title: string;
  description?: string;
  baseUrl: string;
}

export interface Entry {
  collection: string;
  slug: string;
  url: string;
  data: Record<string, unknown>;
  date?: string;
  tags: string[];
  bodyHtml: string;
}

export interface Collection {
  id: string;
  entries: Entry[];
}

export interface SiteModel {
  site: SiteMeta;
  home: Entry;
  pages: Entry[];
  collections: Record<string, Collection>;
  tags: Record<string, Record<string, Entry[]>>;
}

export interface RawFile {
  path: string;
  raw: string;
}

export function buildSiteModel(files: RawFile[]): SiteModel {
  const indexFile = files.find((f) => f.path === "index.md");
  const rawSite = indexFile
    ? (parseFrontmatter(indexFile.raw).data.site as
        Record<string, unknown> | undefined)
    : undefined;
  const baseUrl = normalizeBase(str(rawSite?.baseUrl, ""));
  const site: SiteMeta = {
    title: str(rawSite?.title, "Site"),
    description:
      rawSite?.description == null ? undefined : str(rawSite.description, ""),
    baseUrl,
  };

  const home = indexFile
    ? toEntry(indexFile, "", baseUrl)
    : {
        collection: "",
        slug: "",
        url: `${baseUrl}/`,
        data: {},
        tags: [],
        bodyHtml: "",
      };

  const pages = files
    .filter((f) => f.path !== "index.md" && !f.path.includes("/"))
    .map((f) => toEntry(f, "", baseUrl));

  const collections = files
    .filter((f) => f.path.includes("/"))
    .reduce<Record<string, Collection>>((acc, f) => {
      const id = f.path.split("/")[0]!;
      (acc[id] ??= { id, entries: [] }).entries.push(toEntry(f, id, baseUrl));
      return acc;
    }, {});

  for (const c of Object.values(collections)) c.entries.sort(compareEntries);

  const tags = Object.values(collections).reduce<
    Record<string, Record<string, Entry[]>>
  >((acc, c) => {
    const map = c.entries.reduce<Record<string, Entry[]>>((m, e) => {
      for (const t of e.tags) (m[t] ??= []).push(e);
      return m;
    }, {});
    if (Object.keys(map).length) acc[c.id] = map;
    return acc;
  }, {});

  return { site, home, pages, collections, tags };
}

function toEntry(file: RawFile, collection: string, baseUrl: string): Entry {
  const { data, body } = parseFrontmatter(file.raw);
  const slug = file.path === "index.md" ? "" : basename(file.path);
  const segments = collection ? [collection, slug] : slug ? [slug] : [];
  const url = `${baseUrl}/${segments.length ? segments.join("/") + "/" : ""}`;
  const tags = Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : [];
  const date = data.date == null ? undefined : String(data.date);
  return {
    collection,
    slug,
    url,
    data,
    date,
    tags,
    bodyHtml: renderMarkdown(body, baseUrl),
  };
}

function basename(path: string): string {
  return (path.split("/").pop() ?? "").replace(/\.md$/, "");
}

function normalizeBase(base: string): string {
  if (base === "" || base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  if (a.date) return -1;
  if (b.date) return 1;
  return a.slug < b.slug ? -1 : 1;
}

function str(value: unknown, fallback: string): string {
  return value == null ? fallback : String(value);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/site.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cms/site.ts src/cms/site.test.ts
git commit -m "feat: add site model builder"
```

---

## Task 7: Render pass (site model → output files)

**Files:**

- Create: `src/cms/render.ts`
- Test: `src/cms/render.test.ts`

**Interfaces:**

- Consumes: `SiteModel`, `Entry`, `SiteMeta` types from `./site.ts`; `renderTemplate`, `Context`, `Partials` from `./template.ts`.
- Produces:
  - `interface OutputFile { path: string; html: string }` — `path` is the URL path (no leading slash, no `baseUrl`); the shell writes `<path>/index.html`. Home is `path: ""`.
  - `type Templates = Record<string, string>` — template filename → contents.
  - `renderSite(model: SiteModel, templates: Templates, partials: Partials): OutputFile[]` — pure. Resolves templates by convention; a missing template throws `Error("Missing template: templates/<name>")`.

- [ ] **Step 1: Write the failing tests**

`src/cms/render.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cms/render.test.ts`
Expected: FAIL — cannot find module `./render.ts`.

- [ ] **Step 3: Write minimal implementation**

`src/cms/render.ts`:

```ts
import type { Collection, Entry, SiteMeta, SiteModel } from "./site.ts";
import type { Context, Partials } from "./template.ts";
import { renderTemplate } from "./template.ts";

export interface OutputFile {
  path: string;
  html: string;
}

export type Templates = Record<string, string>;

export function renderSite(
  model: SiteModel,
  templates: Templates,
  partials: Partials,
): OutputFile[] {
  const page = (name: string, ctx: Context): string => {
    const tpl = templates[name];
    if (tpl === undefined)
      throw new Error(`Missing template: templates/${name}`);
    return renderTemplate(tpl, ctx, partials);
  };

  const home: OutputFile = {
    path: "",
    html: page("index.html", entryContext(model.site, model.home)),
  };

  const pages = model.pages.map((p) => ({
    path: p.slug,
    html: page("page.html", entryContext(model.site, p)),
  }));

  const collectionFiles = Object.values(model.collections).flatMap((c) =>
    collectionOutputs(c, model, page),
  );

  return [home, ...pages, ...collectionFiles];
}

function collectionOutputs(
  c: Collection,
  model: SiteModel,
  page: (name: string, ctx: Context) => string,
): OutputFile[] {
  const entries = c.entries.map((e) => ({
    path: `${c.id}/${e.slug}`,
    html: page(`${c.id}.entry.html`, entryContext(model.site, e)),
  }));

  const list: OutputFile = {
    path: c.id,
    html: page(`${c.id}.list.html`, {
      site: model.site,
      collection: { id: c.id },
      entries: c.entries.map(view),
    }),
  };

  const tagFiles = Object.entries(model.tags[c.id] ?? {}).map(
    ([tag, tagged]) => ({
      path: `${c.id}/tags/${tag}`,
      html: page(`${c.id}.tag.html`, {
        site: model.site,
        tag,
        entries: tagged.map(view),
      }),
    }),
  );

  return [...entries, list, ...tagFiles];
}

function entryContext(site: SiteMeta, entry: Entry): Context {
  return { ...view(entry), site };
}

function view(entry: Entry): Record<string, unknown> {
  return {
    ...entry.data,
    url: entry.url,
    slug: entry.slug,
    tags: entry.tags,
    date: entry.date,
    body: entry.bodyHtml,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cms/render.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cms/render.ts src/cms/render.test.ts
git commit -m "feat: add render pass producing output files"
```

---

## Task 8: Build shell and entry point

**Files:**

- Create: `src/cms/build.ts`
- Test: `src/cms/build.test.ts`
- Modify: `src/index.ts` (replace `greet` sample)
- Delete: `src/index.test.ts`
- Modify: `package.json` (add `build` script, add build to `check`)

**Interfaces:**

- Consumes: `buildSiteModel`, `RawFile` from `./site.ts`; `renderSite`, `Templates` from `./render.ts`; `Partials` from `./template.ts`.
- Produces: `build(root?: string): OutputFile[]` — reads `content/`, `templates/`, `static/` under `root` (default `process.cwd()`), writes `_site/`, returns the output files. The only fs I/O in the core.

- [ ] **Step 1: Write the failing test**

`src/cms/build.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cms/build.test.ts`
Expected: FAIL — cannot find module `./build.ts`.

- [ ] **Step 3: Write the build shell**

`src/cms/build.ts`:

```ts
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { buildSiteModel } from "./site.ts";
import type { RawFile } from "./site.ts";
import { renderSite } from "./render.ts";
import type { OutputFile, Templates } from "./render.ts";
import type { Partials } from "./template.ts";

export function build(root: string = process.cwd()): OutputFile[] {
  const model = buildSiteModel(loadContent(join(root, "content")));
  const { templates, partials } = loadTemplates(join(root, "templates"));
  const files = renderSite(model, templates, partials);

  const outDir = join(root, "_site");
  rmSync(outDir, { recursive: true, force: true });
  writeSite(outDir, files);

  const staticDir = join(root, "static");
  if (existsSync(staticDir)) cpSync(staticDir, outDir, { recursive: true });

  return files;
}

function loadContent(dir: string): RawFile[] {
  const files: RawFile[] = [];
  const walk = (current: string): void => {
    if (!existsSync(current)) return;
    for (const ent of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith(".md")) {
        files.push({
          path: relative(dir, full).split(sep).join("/"),
          raw: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(dir);
  return files;
}

function loadTemplates(dir: string): {
  templates: Templates;
  partials: Partials;
} {
  const templates: Templates = {};
  if (existsSync(dir)) {
    for (const ent of readdirSync(dir)) {
      if (ent.endsWith(".html"))
        templates[ent] = readFileSync(join(dir, ent), "utf8");
    }
  }
  const partials: Partials = {};
  const partialsDir = join(dir, "partials");
  if (existsSync(partialsDir)) {
    for (const ent of readdirSync(partialsDir)) {
      if (ent.endsWith(".html")) {
        partials[ent.replace(/\.html$/, "")] = readFileSync(
          join(partialsDir, ent),
          "utf8",
        );
      }
    }
  }
  return { templates, partials };
}

function writeSite(outDir: string, files: OutputFile[]): void {
  for (const file of files) {
    const dir = join(outDir, file.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), file.html);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cms/build.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Replace the entry point and remove the sample test**

Replace `src/index.ts` with:

```ts
import { build } from "./cms/build.ts";

if (import.meta.main) {
  const files = build();
  console.log(`Built ${files.length} pages into _site/`);
}
```

Delete the old sample test:

```bash
git rm src/index.test.ts
```

- [ ] **Step 6: Add the `build` script and fold it into `check`**

In `package.json`, add to `scripts`:

```json
    "build": "node src/index.ts",
```

and change `check` from:

```json
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test",
```

to:

```json
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build",
```

- [ ] **Step 7: Verify the toolchain (not the full `check` yet)**

Do **not** run `npm run check` here: `check` now runs `build`, and `build` renders the home page, which requires `templates/index.html` — and neither `content/` nor `templates/` exists until Task 9. So a full `check` would throw `Missing template: templates/index.html`. That is expected; the full-check verification happens at the end of Task 9.

For this task, run the parts that are green now:

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS — all tests (the old `src/index.test.ts` is gone; the new `build.test.ts` passes), typecheck, and lint.

The commit below is safe: the pre-commit hook runs lint-staged + `lint` + `typecheck` + `test` (not `build`), so it does not hit the missing-template error.

- [ ] **Step 8: Commit**

```bash
git add src/cms/build.ts src/cms/build.test.ts src/index.ts package.json
git commit -m "feat: add build shell, entry point, and build script"
```

---

## Task 9: Author the initial site and remove `docs/`

**Files:**

- Create: `content/index.md`, `content/about.md`, `content/blog/hello.md`
- Create: `templates/index.html`, `templates/page.html`, `templates/blog.entry.html`, `templates/blog.list.html`, `templates/blog.tag.html`, `templates/partials/head.html`
- Delete: `docs/index.html`, `docs/.nojekyll`
- Modify: `README.md` (usage line)

**Interfaces:**

- Consumes: everything from Tasks 1–8. This task produces a real site that `npm run build` renders and `npm run check` validates.

- [ ] **Step 1: Create the content**

`content/index.md`:

```markdown
---
site:
  title: playground
  description: A TypeScript scratch space that runs .ts directly on Node, with no build step.
  baseUrl: /playground
---

# playground

A TypeScript scratch space with no build step.

Node runs `.ts` files directly via type stripping — no bundler, no `tsx`, no compile output. TypeScript is here to type-check, not to build.
```

`content/about.md`:

```markdown
---
title: About
---

# About

This site is generated by a zero-dependency static site generator that lives in the repo. Content is Markdown; templates are plain HTML with `{{ }}` placeholders.
```

`content/blog/hello.md`:

```markdown
---
title: Hello, world
date: 2026-07-19
tags: [meta, typescript]
---

# Hello, world

The first post, rendered from Markdown by the in-repo generator.
```

- [ ] **Step 2: Create the templates**

`templates/partials/head.html`:

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{ site.title }}</title>
<meta name="description" content="{{ site.description }}" />
```

`templates/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    {{> head }}
  </head>
  <body>
    <main>
      {{{ body }}}
      <nav>
        <a href="{{ site.baseUrl }}/about/">About</a>
        <a href="{{ site.baseUrl }}/blog/">Blog</a>
      </nav>
    </main>
  </body>
</html>
```

`templates/page.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    {{> head }}
  </head>
  <body>
    <main>{{{ body }}}</main>
  </body>
</html>
```

`templates/blog.entry.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    {{> head }}
  </head>
  <body>
    <main>
      <article>{{{ body }}}</article>
      <p>
        {{#each tags}}<a href="{{ site.baseUrl }}/blog/tags/{{ this }}/"
          >#{{ this }}</a
        >
        {{/each}}
      </p>
    </main>
  </body>
</html>
```

`templates/blog.list.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    {{> head }}
  </head>
  <body>
    <main>
      <h1>Blog</h1>
      <ul>
        {{#each entries}}
        <li><a href="{{ url }}">{{ title }}</a> — {{ date }}</li>
        {{/each}}
      </ul>
    </main>
  </body>
</html>
```

`templates/blog.tag.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    {{> head }}
  </head>
  <body>
    <main>
      <h1>Tag: {{ tag }}</h1>
      <ul>
        {{#each entries}}
        <li><a href="{{ url }}">{{ title }}</a></li>
        {{/each}}
      </ul>
    </main>
  </body>
</html>
```

Note: `{{ site.baseUrl }}` is available in every template because `entryContext` and the list/tag contexts all include `site`. In `blog.entry.html`, inside `{{#each tags}}` the outer `site` is still in scope (the engine spreads the item over the existing context, so `site` remains).

- [ ] **Step 3: Remove the old hand-written Pages directory**

```bash
git rm docs/index.html docs/.nojekyll
```

- [ ] **Step 4: Update the README usage block**

In `README.md`, under `## Usage`, add a line after `npm run check`:

```
npm run build      # render content/ + templates/ into _site/
```

- [ ] **Step 5: Build and inspect the output**

Run: `npm run build`
Expected: prints `Built 5 pages into _site/` (home, about, blog/hello, blog list, one tag page per tag → home + about + hello + list + `meta` + `typescript` = 6; confirm the count matches the number of `OutputFile`s). Then:

Run: `ls _site && ls _site/blog && cat _site/index.html`
Expected: `_site/index.html`, `_site/about/index.html`, `_site/blog/index.html`, `_site/blog/hello/index.html`, `_site/blog/tags/meta/index.html`, `_site/blog/tags/typescript/index.html` exist; `_site/index.html` contains `<title>playground</title>` and the rendered `<h1>playground</h1>`.

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS — format, lint, typecheck, tests, and build all succeed. (`_site/` is ignored by Prettier, ESLint, and git from Task 1.)

- [ ] **Step 7: Commit**

```bash
git add content templates README.md
git rm --cached docs/index.html docs/.nojekyll 2>/dev/null || true
git commit -m "feat: author initial site content and templates; remove hand-written docs"
```

---

## Task 10: CI — build in `check`, deploy via Pages Actions, update docs

**Files:**

- Modify: `.github/workflows/ci.yml` (add `deploy` job; update `links` job)
- Modify: `CLAUDE.md` (GitHub Pages + Enforcement sections)

**Interfaces:**

- Consumes: `npm run build` and `_site/` from earlier tasks.

- [ ] **Step 1: Replace `.github/workflows/ci.yml`**

Full new file:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    # Link rot happens with no commit to trigger it.
    - cron: "0 9 * * 1"

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check

  links:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: lycheeverse/lychee-action@v2.9.0
        with:
          args: --no-progress --verbose README.md CLAUDE.md "_site/**/*.html"
          fail: true
        env:
          # Authenticates github.com requests so they are not rate limited.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: check
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    concurrency:
      group: pages
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      # Enables Pages and sets the publish source to "GitHub Actions" on first run;
      # idempotent thereafter — this removes any manual repo-settings step.
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Update the CLAUDE.md "GitHub Pages" section**

Replace the entire `## GitHub Pages` section with:

```markdown
## GitHub Pages

<https://micrubdev.github.io/playground/> is built and deployed by the `deploy`
job in `.github/workflows/ci.yml`. The site source is `content/` (Markdown) plus
`templates/` (`{{ }}` HTML); the zero-dependency generator in `src/cms/` renders
it into `_site/`, which CI uploads as a Pages artifact and deploys. **`_site/` is
gitignored and never committed** — `content/` and `templates/` are the source of
truth.

The Pages publish source is "GitHub Actions", set automatically by the
`actions/configure-pages` step (no manual settings change). Because deployment is
an Actions job, there IS a run per deploy — watch `gh run list` and the run's
deploy step, plus `gh api repos/micrubdev/playground/pages -q .status`.

There is no `docs/` directory and no `.nojekyll`: the Pages-artifact path serves
files as-is and never runs Jekyll.

Nothing verifies the page actually renders — a visually broken page deploys
happily. The `links` job builds `_site/` and runs lychee over it plus `README.md`
and `CLAUDE.md`.
```

- [ ] **Step 3: Update the CLAUDE.md "Enforcement" section**

In the `## Enforcement` section, update the CI job description. Replace the `- \`links\` — lychee over \`README.md\`, \`CLAUDE.md\`, \`docs/index.html\`.`line and its surrounding`check`/`links` list with:

```markdown
- `check` — `npm ci && npm run check`. `check` now also runs `npm run build`, so a
  broken template or unparseable content fails the required gate. This is the one
  the ruleset requires.
- `deploy` — builds `_site/` and deploys it to Pages (Actions). Runs on pushes to
  `main` only; not a required status check.
- `links` — builds `_site/`, then lychee over `README.md`, `CLAUDE.md`, and
  `_site/**/*.html`.
```

Also update the `check` description in the "same `check` runs in three places" paragraph and the pre-commit note to mention it now includes `build` (still no committed output to diff — `_site/` is gitignored).

- [ ] **Step 4: Validate the workflow YAML locally**

Run: `npx --yes @action-validator/cli .github/workflows/ci.yml 2>/dev/null || echo "validator unavailable — skip"`
Expected: no errors, or the skip message. (Optional; the authoritative check is CI itself.)

- [ ] **Step 5: Run the full check once more**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml CLAUDE.md
git commit -m "ci: build and deploy the site to Pages via Actions"
```

---

## Post-implementation: one-time verification on `main`

After merging to `main`, the first `deploy` run configures Pages and publishes. Confirm:

```bash
gh run list --workflow=ci.yml --limit 1
gh api repos/micrubdev/playground/pages -q .status   # expect "built"
```

Then load <https://micrubdev.github.io/playground/> and click through to `/about/` and `/blog/`.

---

## Self-Review notes (addressed)

- **Spec coverage:** frontmatter subset (T2), Markdown subset (T3–T4), `{{ }}` engine incl. partials/each/if (T5), collections + pages + home + per-collection tags + sorting + baseUrl (T6), template-resolution convention + missing-template error (T7), `_site/` output + static copy (T8), site-metadata-in-`index.md` + landing-page migration + `docs/` removal (T9), CI build-in-`check` + `configure-pages` deploy + links-over-`_site` + CLAUDE.md rewrite (T10). No gaps.
- **Type consistency:** `RawFile`, `Entry`, `SiteModel`, `OutputFile`, `Templates`, `Context`, `Partials`, `renderSite`, `buildSiteModel`, `build` names/signatures match across tasks.
- **Functional shape:** T1–T7 are pure; all fs/`console` effects are confined to T8's `build.ts` and `src/index.ts`.

```

```
