# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A TypeScript scratch space. Source lives in `src/`.

## Commands

```bash
npm run check      # format + lint + typecheck + test (run this before calling work done)
npm start          # run src/index.ts
npm run format     # prettier --write .
npm run lint       # eslint .
npm run lint:fix   # eslint . --fix
npm run typecheck  # tsc --noEmit
npm test           # vitest run (matches src/**/*.test.ts)
npm run test:watch # vitest in watch mode
npx vitest run src/index.test.ts   # run a single test file
npx vitest run -t "pattern"        # run tests matching a name
npx vitest run --reporter=verbose  # show console output from tests
```

## No build step

Node runs `.ts` files directly via type stripping, so there is no bundler, no
`tsx`, and no compile output. TypeScript is type-checking only (`noEmit`), and
`npm start` hands the `.ts` file straight to `node`.

This has a consequence that will bite otherwise: `tsconfig.json` sets
`erasableSyntaxOnly`, so **enums, namespaces, and parameter properties are
unavailable** — Node erases type syntax rather than compiling it, and those
features require real emit. Use union types or `as const` objects instead of
enums. `typecheck` enforces this, so violations fail there rather than at runtime.

Relative imports must carry the literal `.ts` extension:

```ts
import { greet } from "./index.ts"; // works
import { greet } from "./index.js"; // passes typecheck, ERR_MODULE_NOT_FOUND at runtime
import { greet } from "./index"; // caught by typecheck (TS2835)
```

The `.js` form is the trap. It is the usual TypeScript convention under
`nodenext`, so it is the natural thing to write, and `typecheck` passes it
clean — but Node resolves the real file on disk and there is no `index.js`.
Only running the code catches it, so prefer `npm start` over `npm run typecheck`
when verifying that imports resolve.

## Tests

Vitest, configured in `vitest.config.ts`. Test files are `src/**/*.test.ts` and
import from `vitest` explicitly — there are no globals, so `expect` and `test`
must be imported.

Vitest transforms TypeScript with its own pipeline rather than using Node's type
stripping, so it is not bound by `erasableSyntaxOnly` the way the runtime is. An
enum would run under Vitest and crash under `npm start`. `typecheck` is what
catches that gap, so run it alongside the tests.

The default reporter **hides `console.log` output**. Use `--reporter=verbose` to
see it, or you will think logging is broken.

Entry-point side effects are guarded with `import.meta.main`, which is true under
`node src/index.ts` and false under Vitest. That keeps importing a module from a
test free of side effects — worth preserving if you add more entry points.

## Branch protection

Two rulesets guard `main`, deliberately split so the owner keeps a short loop
while outside contributions stay gated:

| Ruleset          | Rules                             | Admin bypass |
| ---------------- | --------------------------------- | ------------ |
| `main ci gate`   | requires `check` status, strict   | yes          |
| `main integrity` | no force push, no branch deletion | no           |

So the repo owner **can** push directly to `main`, and **cannot** force-push or
delete it — that second one applies to everyone, with no exceptions.

Note what the CI gate can and cannot do. A required status check cannot vet a
direct push, because CI only runs once the commit is already on GitHub; before
the bypass existed, every direct push was rejected with GH013 for a check that
had not run and never could. The gate's real job is blocking PR merges. The thing
actually protecting `main` from a bad direct push is the local pre-commit hook.

Outside contributors have no bypass, so they get the full gate: PR, green CI, and
branch up to date with `main` before merge.

```bash
gh pr create --fill && gh pr merge --squash --auto   # reviews are not required
```

The required check is named `check` — the job id in `ci.yml`. Renaming that job
silently breaks the gate, which then waits forever for a check that never reports.

To rewrite `main` history you must disable `main integrity` (PUT the full ruleset
JSON with `"enforcement": "disabled"`; PATCH returns 404), push, then re-enable it.

The repo is public because GitHub gates rulesets on private repos behind Pro.

## CI

`.github/workflows/ci.yml` runs `npm ci && npm run check` on pushes to `main`
and on every pull request. It is the same `check` the pre-commit hook runs, so
CI failing on a commit that passed locally means a version drift, not a rule
difference.

The Node version comes from `.nvmrc` (currently `26`), which is a major-version
floor rather than a pin — CI resolves it to the latest 26.x, so it can be ahead
of your local Node. Change `.nvmrc` to move both.

## Pre-commit hook

Husky runs `.husky/pre-commit` on every commit: lint-staged (Prettier on staged
files), then `lint`, `typecheck`, and `test` across the repo. A commit with lint
errors or failing tests is rejected. This duplicates `npm run check`, so if
`check` passes locally the commit will go through.

lint-staged **rewrites staged files in place** and the reformatted version is
what gets committed, so the file on disk may differ from what you wrote. That is
expected, not a bug.

Use `git commit --no-verify` to bypass when genuinely needed. `npx husky init`
overwrites `.husky/pre-commit` with a placeholder — don't re-run it.

## Formatting

Prettier, all defaults (`.prettierrc.json` is deliberately `{}`). Run
`npm run format`; `npm run check` fails on unformatted files.

There is no `eslint-config-prettier`, and it is not an oversight — ESLint 10 ships
no formatting rules and `recommendedTypeChecked` enables none, so the two tools
do not overlap and there is nothing to turn off. Adding stylistic ESLint rules
later would change that.

Prettier reformats code blocks inside markdown, so hand-aligned comments in
fenced examples get collapsed. Don't fight it.

## Lint

ESLint flat config in `eslint.config.js`, using `typescript-eslint`'s
`recommendedTypeChecked` — the rules are **type-aware**, so they catch things
like floating promises and unsafe `any` access that syntax-only linting misses.
The cost is that ESLint needs every linted `.ts` file to be inside the
TypeScript project: a new `.ts` file outside `tsconfig.json`'s `include` fails
with "was not found by the project service" rather than being skipped. Add such
files to `include` (that is why `vitest.config.ts` is listed there).

The config is `.js`, not `.ts`, on purpose. ESLint requires the `jiti` transform
to load a TypeScript config, and that pulls a transform layer into a repo whose
whole point is not having one. Type-checked rules are scoped to `**/*.ts`, so
`eslint.config.js` itself is linted with the plain JS rules only.

## Types

`@types/node` tracks v24 while the runtime is Node 26 — the newest published
types. Occasional newer runtime APIs may be missing from the types.
