import { build } from "./cms/build.ts";

if (import.meta.main) {
  const files = build();
  console.log(`Built ${files.length} pages into _site/`);
}
