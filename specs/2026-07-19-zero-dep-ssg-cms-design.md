# Zero-dependency SSG + headless content model — design

**Date:** 2026-07-19
**Status:** Approved (brainstorm), pending implementation plan

## Summary

A zero-runtime-dependency static site generator that lives in this repo. You
author Markdown in `content/` and write `{{ }}` HTML templates in `templates/`;
a Node build script (run directly via type stripping — no build step for the
tool itself) renders the site into `_site/`. GitHub Actions runs that build on
every push to `main` and deploys `_site/` to GitHub Pages as a Pages artifact.
The built output is never committed — `content/` + `templates/` are the source
of truth, and Pages' publish source is "GitHub Actions", not a branch.

It is "headless" in that the build produces an in-memory **site model** — a
queryable object graph of collections, entries, and tags — and HTML rendering is
just one consumer of that model. The model is a real, tested artifact, not an
implementation detail of the renderer.

Everything obeys the repo's constraints: no runtime dependencies, Node built-ins
only, relative imports carry the literal `.ts` extension, no enums/namespaces
(`erasableSyntaxOnly`), entry side effects guarded by `import.meta.main`.

## Goals / non-goals

**Goals**

- Author Markdown + frontmatter, get a static site.
- Zero runtime dependencies; the generator runs under Node type stripping.
- Astro-like feel via convention-based collections and separated templates.
- A tested, queryable site model as the intermediate representation.
- A GitOps publish loop: edit → commit → push → CI builds and deploys to Pages
  (see "Publishing").

**Non-goals**

- 100% CommonMark or full YAML compliance (defined subsets only — see "Parser scope boundaries").
- Request-time behavior (Pages is static; all work happens at build time).
- A browser-based editor / authoring UI (content is edited as files in the repo).
- Broken-link detection (the existing CI `links` lychee job already covers it).

## Directory layout

```
content/              # INPUT — authored content
  index.md            #   home page + site metadata (site.title, baseUrl, ...)
  about.md            #   standalone page
  blog/               #   a collection (any folder under content/ is a collection)
    hello.md
templates/            # INPUT — {{ }} templates, resolved by convention
  index.html          #   home page
  page.html           #   standalone pages
  blog.entry.html     #   one blog post
  blog.list.html      #   /blog/ listing
  blog.tag.html       #   /blog/tags/<tag>/ pages for the blog collection
  partials/nav.html   #   reusable partial, included via {{> nav}}
static/               # INPUT — copied verbatim into the build output (css, images)
src/cms/*.ts          # the generator itself (see "Components")
src/index.ts          # thin entry point -> build (guarded by import.meta.main)
_site/                # OUTPUT — generated, gitignored, uploaded by CI (never committed)
```

`_site/` is fully generated and **gitignored** — it never enters the repo. CI
builds it and deploys it to Pages as an artifact; locally you may build it to
eyeball the result, but there is nothing to commit. The build wipes and rebuilds
`_site/` on every run. No `.nojekyll` is needed: the Pages-artifact path serves
files as-is and never runs Jekyll.

The current hand-written `docs/index.html` landing page migrates into
`content/index.md` + `templates/index.html`, and the committed `docs/` directory
is removed from the repo entirely (see "Migration notes"). Design/spec docs live
at repo-root `specs/`.

## Conventions

- **Collections:** every folder under `content/` is a collection; its name is the
  collection id (e.g. `content/blog/` → `blog`). Files directly under `content/`
  (except `index.md`) are standalone pages.
- **Template resolution (by naming convention, no config file):**
  - entry: `templates/<collection>.entry.html` → `_site/<collection>/<slug>/index.html`
  - listing: `templates/<collection>.list.html` → `_site/<collection>/index.html`
  - tag: `templates/<collection>.tag.html` → `_site/<collection>/tags/<tag>/index.html`
    (namespaced under the collection so two collections can share a tag name
    without colliding, and each tag page has an unambiguous template)
  - standalone page: `templates/page.html`
  - home: `templates/index.html`
  - A referenced-but-missing template is a build error (fail loud — see "Error handling").
- **Site metadata** lives in `content/index.md` frontmatter under a `site:` map
  (`title`, `description`, `baseUrl`, ...). Templates receive it as `site`.
- **URLs / base path:** GitHub Pages serves this project under `/playground/`.
  `site.baseUrl` (`/playground`) is prefixed onto entry/list/tag URLs when the
  model is built, and root-relative links in Markdown bodies (`/foo`) are
  rewritten to `<baseUrl>/foo` during Markdown rendering. Templates reference
  `{{ site.baseUrl }}` for asset URLs.
- **Sorting:** entries within a collection sort by `date` descending by default
  (documented convention; entries without a date sort last, then by slug).

## Components

Each module is a small unit with one job, testable in isolation.

| Module           | Job                                                                                                                        | Depends on            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `frontmatter.ts` | Split the `---` fenced block from the body; parse a YAML subset (see "Parser scope boundaries") → `{ data, body }`         | none (pure)           |
| `markdown.ts`    | Render a Markdown subset (see "Parser scope boundaries") → HTML, escaping text; rewrite root-relative links with `baseUrl` | none (pure)           |
| `template.ts`    | Compile/render `{{ }}` templates (see "Template engine") against a context object → string                                 | none (pure)           |
| `site.ts`        | Walk `content/`, build the site model: `site` meta + collections (entries with slug/url/date/rendered body) + tag index    | frontmatter, markdown |
| `build.ts`       | Orchestrate: resolve templates by convention, render every page, copy `static/`, write `_site/`                            | site, template        |

### Site model shape (illustrative)

```ts
type SiteMeta = { title: string; description?: string; baseUrl: string };
type Entry = {
  collection: string; // "blog"
  slug: string; // "hello"
  url: string; // "/playground/blog/hello/"
  data: Record<string, unknown>; // parsed frontmatter (title, date, tags, ...)
  date?: string;
  tags: string[];
  bodyHtml: string; // rendered Markdown
};
type Collection = { id: string; entries: Entry[] };
type SiteModel = {
  site: SiteMeta;
  pages: Entry[]; // standalone pages
  collections: Record<string, Collection>;
  // per-collection tag index: collection id -> tag -> entries in that collection
  tags: Record<string, Record<string, Entry[]>>;
};
```

## Parser scope boundaries

Hand-rolling parsers is where zero-dep costs the most, so the supported surface
is deliberately bounded, defined, and testable rather than "best effort at the
whole spec."

**Markdown subset**

- In: ATX headings (`#`..`######`), paragraphs, `**bold**` / `*italic*`,
  `` `inline code` ``, `[links](url)`, `![images](url)`, unordered (`-`) and
  ordered (`1.`) lists, fenced code blocks (` ``` `), blockquotes (`>`),
  horizontal rules (`---`). Text content is HTML-escaped.
- Out: tables, footnotes, raw-HTML passthrough, nested blockquotes, reference
  links, setext headings.

**Frontmatter YAML subset**

- In: string / number / boolean / null / date scalars; nested maps (2-space
  indentation) — enough for the `site:` object; block lists (`- item`) and inline
  lists (`[a, b]`) — enough for `tags:`.
- Out: anchors/aliases, multiline (`|`, `>`) scalars, flow maps (`{a: b}`),
  quoted-key edge cases.

## Template engine

`template.ts` renders `{{ }}` templates against a context object:

- `{{ path }}` — HTML-escaped interpolation.
- `{{{ path }}}` — raw (unescaped) interpolation, for pre-rendered HTML like
  `bodyHtml`.
- `{{#each items}} ... {{/each}}` — iteration; inside, `this` is the current
  item and `@index` the zero-based index. Dotted paths resolve against the item.
- `{{#if path}} ... {{else}} ... {{/if}}` — conditional on truthiness.
- Dotted paths: `{{ post.title }}`, `{{ site.baseUrl }}`.
- Partials: `{{> nav }}` includes `templates/partials/nav.html`, rendered with
  the current context.
- Missing paths resolve to empty string (and are falsy for `{{#if}}`) — lenient,
  never crashes a build on a typo.

The engine is pure (string in → string out), takes no I/O; `build.ts` reads the
template files and hands their contents to the engine.

## Data flow

```
content/*.md ─┬─ frontmatter ─┬─ site model ─┬─ template.render ─→ _site/*/index.html
templates/*  ─┘   markdown ───┘   (+ tags,   │   (per entry/list/tag/page)
static/*  ─────────────────── copied ────────┴─ _site/  ── CI: upload artifact → deploy → Pages
```

## Error handling

Fail loud at build time; keep runtime rendering lenient.

- Missing template for a collection/page kind → build error naming the expected
  file path.
- Frontmatter parse error → error identifying the file and line.
- Missing template variable → renders empty / falsy (no crash).
- Broken links are out of scope — the existing CI `links` (lychee) job covers
  them.

## Testing

- Unit tests per pure module:
  - `frontmatter`: scalars, nested maps, block + inline lists, malformed input.
  - `markdown`: each supported element and HTML escaping; link rewriting.
  - `template`: `each`, `if`/`else`, dotted paths, partials, escaping, missing
    paths.
- One integration test: build a fixture `content/` + `templates/` tree into a
  temp dir and assert the emitted file paths and their contents.
- `import.meta.main` guards so tests importing modules never trigger a build.

## Publishing (GitOps loop)

There is no dev server, watch mode, or live reload, and the build does not run on
your machine as part of publishing. Git is the trigger and the source of truth;
CI does the building and deploying.

```
edit content/ or templates/  →  git commit  →  git push (main)  →  CI builds _site/ → deploys to Pages
```

- **`build`** is the only new script — render `_site/` from `content/` +
  `templates/` + `static/`. Idempotent: same source in, same `_site/` out. Run it
  locally to eyeball output, but there is nothing to commit.
- **Publish = push to `main`.** The `deploy` CI job (see "CI") configures Pages,
  builds, and deploys — no manual repo-settings step, including the very first
  time (its `configure-pages` step flips the publish source to "GitHub Actions").
  Confirm rollout with
  `gh run list` / the run's deploy step (there IS an Actions run now, unlike the
  old branch-served setup) and `gh api repos/micrubdev/playground/pages -q .status`.
- **No local preview server.** The deployed Pages URL is the feedback loop. A
  static preview could be added later without touching the build.

## CI and enforcement

Three jobs in `ci.yml`:

- **`check`** (required) — `npm ci && npm run check`. `check` also runs
  `npm run build` so a broken template or unparseable content **fails the gate**
  before merge. No git-diff guard is needed anymore: nothing generated is
  committed, so there is no committed output to drift. Runs on PRs and pushes.
- **`deploy`** — runs on push to `main` only. Steps: `actions/configure-pages`
  (enables Pages and sets the publish source to "GitHub Actions" via the API,
  idempotently — this is what removes the manual settings step), `npm run build`,
  `actions/upload-pages-artifact` (`_site/`), `actions/deploy-pages`. Needs
  `permissions: { pages: write, id-token: write }`, the `github-pages`
  environment, and a `concurrency` group so overlapping pushes don't race. Not a
  required status check — it runs after merge to publish.
- **`links`** (non-required, as today) — builds `_site/`, then runs lychee over
  `_site/**/*.html`, `README.md`, `CLAUDE.md`. A broken link is visible-but-not
  blocking, matching the existing rationale.

Because output is no longer committed, the pre-commit hook no longer needs to
rebuild; `check` still runs `build` locally as part of the hook to catch build
breakage early, but there is no `git diff` step.

All new `.ts` files must be added to `tsconfig.json`'s `include` so ESLint's
type-checked rules see them (per CLAUDE.md).

## Migration notes

- Move the hand-written `docs/index.html` content into `content/index.md` +
  `templates/index.html`; CI regenerates it into `_site/index.html`.
- **Remove the committed `docs/` directory** (`docs/index.html`, `docs/.nojekyll`)
  from the repo; add `_site/` to `.gitignore`.
- **No manual Pages-settings change.** The `deploy` job's `actions/configure-pages`
  step switches the publish source from "Deploy from a branch" (`docs/`) to
  "GitHub Actions" on the first push and is idempotent thereafter, so the switch
  happens in CI. (Residual constraint: the org/repo must permit Actions to manage
  Pages — true for this public, user-owned repo with default settings. If an org
  policy ever blocked API-based enablement, enabling Pages once in the UI would be
  the only fallback; not expected here.)
- Rewrite the `CLAUDE.md` "GitHub Pages" section: the site is now built and
  deployed by an Actions workflow, so there IS an Actions run per deploy — the old
  note ("no Actions run for the deploy, watch pages status rather than
  `gh run list`") reverses. `docs/` no longer exists; `.nojekyll` is gone.

## Open questions

None outstanding. Ready for an implementation plan.
