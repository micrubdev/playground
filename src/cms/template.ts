import { escapeHtml } from "./html.ts";

export type Context = Record<string, unknown>;
export type Partials = Record<string, string>;

type Token =
  | { t: "text"; v: string }
  | { t: "var"; path: string; raw: boolean }
  | { t: "open"; kind: "each" | "if"; path: string }
  | { t: "else" }
  | { t: "close" }
  | { t: "partial"; name: string };

type Node =
  | { type: "text"; value: string }
  | { type: "var"; path: string; raw: boolean }
  | { type: "partial"; name: string }
  | { type: "each"; path: string; body: Node[] }
  | { type: "if"; path: string; body: Node[]; alt: Node[] };

export function renderTemplate(
  tpl: string,
  ctx: Context,
  partials: Partials = {},
): string {
  const [nodes] = parseNodes(tokenize(tpl), 0);
  return renderNodes(nodes, ctx, partials);
}

function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  const re = /\{\{\{(.*?)\}\}\}|\{\{(.*?)\}\}/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m.index > last) tokens.push({ t: "text", v: tpl.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      tokens.push({ t: "var", path: m[1].trim(), raw: true });
      continue;
    }
    const inner = (m[2] ?? "").trim();
    if (inner.startsWith("#each "))
      tokens.push({ t: "open", kind: "each", path: inner.slice(6).trim() });
    else if (inner.startsWith("#if "))
      tokens.push({ t: "open", kind: "if", path: inner.slice(4).trim() });
    else if (inner === "else") tokens.push({ t: "else" });
    else if (inner.startsWith("/")) tokens.push({ t: "close" });
    else if (inner.startsWith(">"))
      tokens.push({ t: "partial", name: inner.slice(1).trim() });
    else tokens.push({ t: "var", path: inner, raw: false });
  }
  if (last < tpl.length) tokens.push({ t: "text", v: tpl.slice(last) });
  return tokens;
}

function parseNodes(tokens: Token[], start: number): [Node[], number] {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const tk = tokens[i]!;
    if (tk.t === "close" || tk.t === "else") return [nodes, i];
    if (tk.t === "text") {
      nodes.push({ type: "text", value: tk.v });
      i++;
    } else if (tk.t === "var") {
      nodes.push({ type: "var", path: tk.path, raw: tk.raw });
      i++;
    } else if (tk.t === "partial") {
      nodes.push({ type: "partial", name: tk.name });
      i++;
    } else if (tk.t === "open" && tk.kind === "each") {
      const [body, j] = parseNodes(tokens, i + 1);
      nodes.push({ type: "each", path: tk.path, body });
      i = j + 1;
    } else if (tk.t === "open" && tk.kind === "if") {
      const [body, j] = parseNodes(tokens, i + 1);
      let alt: Node[] = [];
      let k = j;
      if (tokens[j]?.t === "else") {
        const [altNodes, jj] = parseNodes(tokens, j + 1);
        alt = altNodes;
        k = jj;
      }
      nodes.push({ type: "if", path: tk.path, body, alt });
      i = k + 1;
    } else {
      i++;
    }
  }
  return [nodes, i];
}

function renderNodes(nodes: Node[], ctx: Context, partials: Partials): string {
  return nodes.map((n) => renderNode(n, ctx, partials)).join("");
}

function renderNode(node: Node, ctx: Context, partials: Partials): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "var": {
      const s = stringify(resolve(node.path, ctx));
      return node.raw ? s : escapeHtml(s);
    }
    case "partial":
      return renderTemplate(partials[node.name] ?? "", ctx, partials);
    case "each": {
      const list = resolve(node.path, ctx);
      if (!Array.isArray(list)) return "";
      return list
        .map((item: unknown) =>
          renderNodes(
            node.body,
            { ...ctx, this: item, ...(isObject(item) ? item : {}) },
            partials,
          ),
        )
        .join("");
    }
    case "if": {
      const v = resolve(node.path, ctx);
      const truthy = Array.isArray(v) ? v.length > 0 : Boolean(v);
      return renderNodes(truthy ? node.body : node.alt, ctx, partials);
    }
  }
}

function resolve(path: string, ctx: Context): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    return isObject(acc) ? acc[key] : undefined;
  }, ctx);
}

// Only primitives interpolate. A map or array would stringify to
// "[object Object]" or a comma-joined blob, neither of which is ever wanted in
// the page — render nothing instead.
function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
