# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A TypeScript scratch space. Source lives in `src/`; `src/index.ts` is the entry point.

One idea explains most of the choices here: **Node runs `.ts` files directly via
type stripping, so there is no build step.** No bundler, no `tsx`, no compile
output. TypeScript is type-checking only (`noEmit`), and `npm start` hands the
`.ts` file straight to `node`. Most surprises below follow from that.

## Commands

```bash
npm run check      # format + lint + typecheck + test — the gate; run before calling work done
npm start          # run src/index.ts
npm test           # vitest run
npm run test:watch # vitest in watch mode
npm run lint       # eslint . (:fix to autofix)
npm run typecheck  # tsc --noEmit
npm run format     # prettier --write .

npx vitest run src/index.test.ts   # single test file
npx vitest run -t "pattern"        # tests matching a name
npx vitest run --reporter=verbose  # show console output (hidden by default)
```

## What type stripping costs

Node erases type syntax rather than compiling it, so anything requiring real
emit is unavailable. `tsconfig.json` sets `erasableSyntaxOnly` to enforce this:
**no enums, namespaces, or parameter properties.** Use union types or `as const`
objects instead of enums. Violations fail both `typecheck` (TS1294) and the
runtime (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`).

Relative imports must carry the literal `.ts` extension:

```ts
import { greet } from "./index.ts"; // works
import { greet } from "./index.js"; // passes typecheck, ERR_MODULE_NOT_FOUND at runtime
import { greet } from "./index"; // caught by typecheck (TS2835)
```

The `.js` form is the trap. It is the normal TypeScript convention under
`nodenext`, so it is the natural thing to write, and `typecheck` passes it clean —
but Node resolves the real file on disk and no `index.js` exists. Only running the
code catches it.

Entry-point side effects are guarded with `import.meta.main` (true under `node`,
false under Vitest), so importing a module from a test does not execute it. Worth
preserving if you add entry points.

## Tests

Vitest, configured in `vitest.config.ts`. Files are `src/**/*.test.ts`. There are
no globals — import `expect` and `test` from `vitest` explicitly.

Vitest transforms TypeScript with its own pipeline instead of Node's type
stripping, so **it is not bound by `erasableSyntaxOnly`**. An enum would pass
under Vitest and crash under `npm start`. `typecheck` is the only thing spanning
that gap; tests passing is not sufficient evidence.

The default reporter **hides `console.log`**. Use `--reporter=verbose` before
concluding that logging is broken.

## Lint

ESLint flat config in `eslint.config.js`, using typescript-eslint's
`recommendedTypeChecked`. Rules are **type-aware**, catching floating promises and
unsafe `any` access that syntax-only linting misses.

The cost: every linted `.ts` file must be inside the TypeScript project. A new
`.ts` file outside `tsconfig.json`'s `include` **fails** with "was not found by
the project service" rather than being skipped — add it to `include`, which is why
`vitest.config.ts` is listed there.

The config is `.js`, not `.ts`, deliberately: ESLint needs the `jiti` transform to
load a TypeScript config, which drags a transform layer into a repo whose whole
point is not having one. Type-checked rules are scoped to `**/*.ts`, so
`eslint.config.js` is linted with plain JS rules only.

## Formatting

Prettier, all defaults (`.prettierrc.json` is deliberately `{}`).

There is no `eslint-config-prettier` and that is not an oversight — ESLint 10
ships no formatting rules and `recommendedTypeChecked` enables none, so nothing
overlaps and nothing needs disabling. Adding stylistic ESLint rules would change
that.

Prettier reformats code blocks inside markdown, so hand-aligned comments in fenced
examples get collapsed. Don't fight it.

## Enforcement

The same `check` runs in three places, so a green `check` locally means the commit
and CI will pass.

**Pre-commit** (`.husky/pre-commit`): lint-staged, then `lint`, `typecheck`,
`test`. lint-staged **rewrites staged files in place**, so what gets committed can
differ from what you wrote — expected, not a bug. Bypass with
`git commit --no-verify`. Do not re-run `npx husky init`; it overwrites the hook
with a placeholder.

**CI** (`.github/workflows/ci.yml`): `npm ci && npm run check` on pushes to `main`
and every PR. The Node version comes from `.nvmrc` (`26`), which is a major-version
floor, not a pin — CI resolves the latest 26.x and can run ahead of your local
Node. CI failing on a commit that passed locally means version drift, not a rule
difference.

**Branch protection** — two rulesets guard `main`:

| Ruleset          | Rules                             | Admin bypass |
| ---------------- | --------------------------------- | ------------ |
| `main ci gate`   | requires `check`, strict          | yes          |
| `main integrity` | no force push, no branch deletion | no           |

You can push directly to `main`. Nobody, including admins, can force-push or
delete it.

The bypass exists because **a required status check cannot vet a direct push** —
CI only runs once the commit is on GitHub, so before the bypass every direct push
was rejected (GH013) waiting on a check that had not run and never could. The
gate's real job is blocking PR merges; the pre-commit hook is what actually
protects `main` from a bad direct push.

Outside contributors have no bypass and get the full gate: PR, green CI, branch up
to date with `main`.

```bash
gh pr create --fill && gh pr merge --squash --auto   # reviews are not required
```

The required check is named `check` — the job id in `ci.yml`. Rename that job and
the gate silently waits forever for a check that never reports.

To rewrite `main` history, disable `main integrity` first (PUT the full ruleset
JSON with `"enforcement": "disabled"` — PATCH returns 404), push, then re-enable.

The repo is public because GitHub gates rulesets on private repos behind Pro.

## Types

`@types/node` tracks v24 while the runtime is Node 26 — v24 is the newest
published. Recent runtime APIs may be missing from the types.
