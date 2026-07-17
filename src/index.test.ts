import { expect, test } from "vitest";
import { greet } from "./index.ts";

test("greet names the target", () => {
  expect(greet("world")).toBe("Hello, world!");
});
