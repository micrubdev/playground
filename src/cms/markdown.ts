import { escapeHtml } from "./html.ts";

// Code spans are split out rather than transformed in place, so their contents
// never reach the emphasis/link passes. The capturing group in `split` puts the
// spans at the odd indices.
export function renderInline(text: string, baseUrl: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2 === 1
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : renderSegment(part, baseUrl),
    )
    .join("");
}

function renderSegment(text: string, baseUrl: string): string {
  return escapeHtml(text)
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_m, alt: string, src: string) =>
        `<img src="${rewrite(src, baseUrl)}" alt="${alt}">`,
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label: string, href: string) =>
        `<a href="${rewrite(href, baseUrl)}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function rewrite(url: string, baseUrl: string): string {
  return url.startsWith("/") ? `${baseUrl}${url}` : url;
}
