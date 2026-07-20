import { parseFrontmatter } from "./frontmatter.ts";
import { renderMarkdown } from "./markdown.ts";

export interface SiteMeta {
  title: string;
  description?: string;
  baseUrl: string;
}

export interface Entry {
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
        slug: "",
        url: `${baseUrl}/`,
        data: {},
        tags: [],
        bodyHtml: "",
      };

  const pages = files
    .filter((f) => f.path !== "index.md" && !f.path.includes("/"))
    .map((f) => toEntry(f, "", baseUrl))
    .filter(published);

  const collections = files
    .filter((f) => f.path.includes("/"))
    .reduce<Record<string, Collection>>((acc, f) => {
      const id = f.path.split("/")[0]!;
      const entry = toEntry(f, id, baseUrl);
      if (published(entry))
        (acc[id] ??= { id, entries: [] }).entries.push(entry);
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
  const tags = Array.isArray(data.tags) ? data.tags.map((t) => str(t, "")) : [];
  const date = data.date == null ? undefined : str(data.date, "");
  return {
    slug,
    url,
    data,
    date,
    tags,
    bodyHtml: renderMarkdown(body, baseUrl),
  };
}

// Astro-style drafts: entries with `draft: true` in frontmatter never render.
function published(entry: Entry): boolean {
  return entry.data.draft !== true;
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
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}
