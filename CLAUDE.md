# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A TypeScript scratch space. Source lives in `src/`.

## Commands

```bash
npm run check      # lint + typecheck + test (run this before calling work done)
npm start          # run src/index.ts
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
import { greet } from "./index.ts";   // works
import { greet } from "./index.js";   // passes typecheck, ERR_MODULE_NOT_FOUND at runtime
import { greet } from "./index";      // caught by typecheck (TS2835)
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
