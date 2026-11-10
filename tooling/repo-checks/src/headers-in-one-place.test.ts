import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  headersFile,
  headerValueProblems,
  readRunningCode,
} from "./headers-in-one-place.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("headerValueProblems", () => {
  it("fails code that writes a header's value itself", () => {
    const files = [
      {
        path: "packages/serve/src/serve.ts",
        text: 'res.setHeader("x-content-type-options", "nosniff");\n',
      },
    ];

    expect(headerValueProblems(files)).toEqual([
      `packages/serve/src/serve.ts:1 writes "nosniff", a header robkit sends. Take it from @robkit/input/headers, where ${headersFile} writes each one.`,
    ]);
  });

  it("lets the headers' own file write them, and a comment name them", () => {
    const files = [
      { path: headersFile, text: '  ["x-frame-options", "DENY"],\n' },
      {
        path: "packages/hono/src/guarded.ts",
        text: "// leaves with X-Frame-Options: SAMEORIGIN and nosniff\n",
      },
    ];

    expect(headerValueProblems(files)).toEqual([]);
  });

  it("finds them written once in robkit's packages and templates", async () => {
    const files = await readRunningCode(root);

    expect(files.map(({ path }) => path)).toContain(headersFile);
    expect(headerValueProblems(files)).toEqual([]);
  });
});
