# playground

[![CI](https://github.com/micrubdev/playground/actions/workflows/ci.yml/badge.svg)](https://github.com/micrubdev/playground/actions/workflows/ci.yml)

A TypeScript scratch space. → [micrubdev.github.io/playground](https://micrubdev.github.io/playground/)

## Setup

```bash
npm install
```

## Usage

```bash
npm run check      # format + lint + typecheck + test + build
npm run build      # render content/ + templates/ into _site/
npm start          # run src/index.ts
npm run format     # format with Prettier
npm run lint       # lint (add :fix to autofix)
npm run typecheck  # type-check without emitting
npm test           # run tests once (Vitest)
npm run test:watch # run tests in watch mode
```

A Husky pre-commit hook formats staged files and runs lint, typecheck, and tests.
Bypass it with `git commit --no-verify` if you need to.

Node runs `.ts` files directly via type stripping, so there is no build step.
TypeScript is used for type-checking only (`noEmit`), which is why `tsconfig.json`
sets `erasableSyntaxOnly` — enums, namespaces, and parameter properties are not
available, since Node strips types rather than compiling them.
