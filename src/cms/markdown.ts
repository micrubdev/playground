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

export function renderMarkdown(src: string, baseUrl: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(
        `<h${level}>${renderInline(heading[2]!.trim(), baseUrl)}</h${level}>`,
      );
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push("<hr>");
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        buf.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote>${renderInline(buf.join(" "), baseUrl)}</blockquote>`,
      );
      continue;
    }
    const list = /^[-*]\s+/.test(line)
      ? ({ marker: /^[-*]\s+/, tag: "ul" } as const)
      : /^\d+\.\s+/.test(line)
        ? ({ marker: /^\d+\.\s+/, tag: "ol" } as const)
        : undefined;
    if (list) {
      const [html, next] = renderList(lines, i, list.marker, list.tag, baseUrl);
      out.push(html);
      i = next;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !isBlockStart(lines[i] ?? "")
    ) {
      buf.push(lines[i] ?? "");
      i++;
    }
    out.push(`<p>${renderInline(buf.join(" ").trim(), baseUrl)}</p>`);
  }
  return out.join("\n");
}

function renderList(
  lines: string[],
  start: number,
  marker: RegExp,
  tag: "ul" | "ol",
  baseUrl: string,
): [string, number] {
  const items: string[] = [];
  let i = start;
  while (i < lines.length && marker.test(lines[i] ?? "")) {
    items.push(
      `<li>${renderInline((lines[i] ?? "").replace(marker, ""), baseUrl)}</li>`,
    );
    i++;
  }
  return [`<${tag}>${items.join("")}</${tag}>`, i];
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("```") ||
    /^#{1,6}\s/.test(line) ||
    line.startsWith(">") ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line.trim())
  );
}
