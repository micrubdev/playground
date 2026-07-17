# playground

A TypeScript scratch space.

## Setup

```bash
npm install
```

## Usage

```bash
npm start        # run src/index.ts
npm run typecheck  # type-check without emitting
npm test         # run node:test files (*.test.ts)
```

Node runs `.ts` files directly via type stripping, so there is no build step.
TypeScript is used for type-checking only (`noEmit`), which is why `tsconfig.json`
sets `erasableSyntaxOnly` — enums, namespaces, and parameter properties are not
available, since Node strips types rather than compiling them.
