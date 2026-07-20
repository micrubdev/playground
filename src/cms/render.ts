import type { Collection, Entry, SiteMeta, SiteModel } from "./site.ts";
import type { Context, Partials } from "./template.ts";
import { renderTemplate } from "./template.ts";

export interface OutputFile {
  path: string;
  html: string;
}

export type Templates = Record<string, string>;

export function renderSite(
  model: SiteModel,
  templates: Templates,
  partials: Partials,
): OutputFile[] {
  const page = (name: string, ctx: Context): string => {
    const tpl = templates[name];
    if (tpl === undefined)
      throw new Error(`Missing template: templates/${name}`);
    return renderTemplate(tpl, ctx, partials);
  };

  const home: OutputFile = {
    path: "",
    html: page("index.html", entryContext(model.site, model.home)),
  };

  const pages = model.pages.map((p) => ({
    path: p.slug,
    html: page("page.html", entryContext(model.site, p)),
  }));

  const collectionFiles = Object.values(model.collections).flatMap((c) =>
    collectionOutputs(c, model, page),
  );

  return [home, ...pages, ...collectionFiles];
}

function collectionOutputs(
  c: Collection,
  model: SiteModel,
  page: (name: string, ctx: Context) => string,
): OutputFile[] {
  const entries = c.entries.map((e, i) => ({
    path: `${c.id}/${e.slug}`,
    html: page(`${c.id}.entry.html`, {
      ...entryContext(model.site, e),
      prev: neighbour(c.entries[i - 1]),
      next: neighbour(c.entries[i + 1]),
    }),
  }));

  const list: OutputFile = {
    path: c.id,
    html: page(`${c.id}.list.html`, {
      site: model.site,
      title: c.id,
      entries: c.entries.map(view),
    }),
  };

  const tagFiles = Object.entries(model.tags[c.id] ?? {}).map(
    ([tag, tagged]) => ({
      path: `${c.id}/tags/${tag}`,
      html: page(`${c.id}.tag.html`, {
        site: model.site,
        title: `${tag} · ${c.id}`,
        tag,
        entries: tagged.map(view),
      }),
    }),
  );

  return [...entries, list, ...tagFiles];
}

// Newest-first order: prev is the newer post, next the older one. Undefined at
// the ends so {{#if prev}} / {{#if next}} hide the links.
function neighbour(entry: Entry | undefined): Context | undefined {
  return entry ? { url: entry.url, title: entry.data.title } : undefined;
}

function entryContext(site: SiteMeta, entry: Entry): Context {
  return { ...view(entry), site };
}

function view(entry: Entry): Record<string, unknown> {
  return {
    ...entry.data,
    url: entry.url,
    tags: entry.tags,
    date: entry.date,
    body: entry.bodyHtml,
  };
}
