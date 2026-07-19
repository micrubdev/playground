import { expect, test } from "vitest";
import { parseFrontmatter } from "./frontmatter.ts";

test("splits frontmatter from body", () => {
  const { data, body } = parseFrontmatter("---\ntitle: Hi\n---\n# Body\n");
  expect(data).toEqual({ title: "Hi" });
  expect(body).toBe("# Body\n");
});

test("returns empty data when there is no frontmatter", () => {
  expect(parseFrontmatter("# Body")).toEqual({ data: {}, body: "# Body" });
});

test("coerces scalar types", () => {
  const { data } = parseFrontmatter(
    "---\nn: 3\nb: true\nx: ~\ns: hello\n---\n",
  );
  expect(data).toEqual({ n: 3, b: true, x: null, s: "hello" });
});

test("parses nested maps and both list forms", () => {
  const { data } = parseFrontmatter(
    "---\nsite:\n  title: T\n  baseUrl: /b\ntags: [a, b]\nmore:\n  - x\n  - y\n---\n",
  );
  expect(data.site).toEqual({ title: "T", baseUrl: "/b" });
  expect(data.tags).toEqual(["a", "b"]);
  expect(data.more).toEqual(["x", "y"]);
});
