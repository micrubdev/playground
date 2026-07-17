# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A TypeScript scratch space. Source lives in `src/`.

## Commands

```bash
npm start          # run src/index.ts
npm run typecheck  # tsc --noEmit
npm test           # node --test (matches *.test.ts)
node --test src/foo.test.ts   # run a single test file
node --test --test-name-pattern="pattern"   # run tests matching a name
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

Tests use the built-in `node:test` runner, not Vitest or Jest.

## Types

`@types/node` tracks v24 while the runtime is Node 26 — the newest published
types. Occasional newer runtime APIs may be missing from the types.
