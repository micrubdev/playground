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
