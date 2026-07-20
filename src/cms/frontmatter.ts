export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

interface Line {
  indent: number;
  text: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const lines = toLines(match[1] ?? "");
  const cursor = { n: 0 };
  const data = lines.length ? parseMap(lines, cursor, lines[0]!.indent) : {};
  return { data, body: raw.slice(match[0].length) };
}

function toLines(src: string): Line[] {
  return src
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
}

function parseMap(
  lines: Line[],
  cursor: { n: number },
  indent: number,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  while (cursor.n < lines.length) {
    const line = lines[cursor.n]!;
    if (line.indent !== indent) break;
    const colon = line.text.indexOf(":");
    const key = line.text.slice(0, colon).trim();
    const rest = line.text.slice(colon + 1).trim();
    cursor.n++;
    if (rest !== "") {
      map[key] = parseScalar(rest);
      continue;
    }
    const next = lines[cursor.n];
    if (next && next.indent > indent && next.text.startsWith("- ")) {
      map[key] = parseList(lines, cursor, next.indent);
    } else if (next && next.indent > indent) {
      map[key] = parseMap(lines, cursor, next.indent);
    } else {
      map[key] = null;
    }
  }
  return map;
}

function parseList(
  lines: Line[],
  cursor: { n: number },
  indent: number,
): unknown[] {
  const list: unknown[] = [];
  while (cursor.n < lines.length) {
    const line = lines[cursor.n]!;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;
    list.push(parseScalar(line.text.slice(2)));
    cursor.n++;
  }
  return list;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => parseScalar(s));
  }
  return v.replace(/^["']|["']$/g, "");
}
