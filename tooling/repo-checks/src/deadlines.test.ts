import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deadlineProblems,
  readOutboundCode,
  undeadlinedFetches,
} from "./deadlines.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const lines = (...code: string[]) => code.join("\n");

describe("undeadlinedFetches", () => {
  it.each([
    ["a fetch with no options", "await fetch(url);"],
    [
      "a fetch whose options have no signal",
      'await fetch(url, { method: "POST" });',
    ],
    [
      "a fetch with only the caller's signal",
      "export const get = (url: string, init?: RequestInit) => fetch(url, { signal: init?.signal });",
    ],
    [
      "a fetch with a signal nothing times out",
      lines(
        "const controller = new AbortController();",
        "await fetch(url, { signal: controller.signal });",
      ),
    ],
    [
      "a fetch that passes on its caller's options",
      "export const get = (url: string, init?: RequestInit) => fetch(url, init);",
    ],
    [
      "a fetch through globalThis",
      "await globalThis.fetch(url, { redirect: 'manual' });",
    ],
  ])("finds %s", (_, code) => {
    expect(undeadlinedFetches(code).map(({ call }) => call)).toHaveLength(1);
  });

  it("names the call and its line, and reads TSX", () => {
    const code = lines(
      "export function Notes() {",
      "  const load = () => api.fetch('/api/notes');",
      "  return <button onClick={load}>Load</button>;",
      "}",
    );

    expect(undeadlinedFetches(code, "tsx")).toEqual([
      { call: "api.fetch", line: 2 },
    ]);
  });

  it.each([
    [
      "a deadline of its own",
      "await fetch(url, { signal: AbortSignal.timeout(5000) });",
    ],
    [
      "the caller's signal combined with a deadline",
      lines(
        "export const get = (url: string, init?: RequestInit) =>",
        "  fetch(url, {",
        "    ...init,",
        "    signal: AbortSignal.any([",
        "      ...(init?.signal ? [init.signal] : []),",
        "      AbortSignal.timeout(30_000),",
        "    ]),",
        "  });",
      ),
    ],
    [
      "a deadline held in a name, combined only sometimes",
      lines(
        "const timeout = AbortSignal.timeout(api.requestTimeoutMs);",
        "await api.fetch(url, {",
        "  signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout,",
        "});",
      ),
    ],
    [
      "a shorthand signal",
      lines(
        "const signal = AbortSignal.timeout(5000);",
        "await fetch(url, { signal });",
      ),
    ],
    [
      "options held in a name",
      lines(
        "const options = { signal: AbortSignal.timeout(5000) };",
        "await fetch(url, options);",
      ),
    ],
    [
      "a fetch that is only words",
      lines(
        "// await fetch(url);",
        'const hint = "Call fetch(url) with a signal.";',
      ),
    ],
  ])("passes %s", (_, code) => {
    expect(undeadlinedFetches(code)).toEqual([]);
  });
});

describe("deadlineProblems", () => {
  const file = (path: string, text: string) => ({ file: path, text });

  it("names the file, line and call, and says what to pass", () => {
    expect(
      deadlineProblems(
        [file("packages/x/src/a.ts", "\nawait fetch(url);")],
        [],
      ),
    ).toEqual([
      "packages/x/src/a.ts:2: fetch(...) has no deadline. Pass signal: AbortSignal.timeout(ms), or AbortSignal.any([callerSignal, AbortSignal.timeout(ms)]) to keep the caller's, as docs/conventions/errors.md says. If it isn't a request robkit sends, add an exception in tooling/repo-checks/src/deadlines.ts saying why.",
    ]);
  });

  it("lets an exception excuse a call in one file", () => {
    const exceptions = [
      { file: "packages/x/src/a.ts", call: "entry.fetch", why: "In-process." },
    ];
    const files = [
      file("packages/x/src/a.ts", "entry.fetch(request);"),
      file("packages/x/src/b.ts", "entry.fetch(request);"),
    ];

    expect(deadlineProblems(files, exceptions)).toEqual([
      expect.stringMatching(/^packages\/x\/src\/b\.ts:1: entry\.fetch/),
    ]);
  });

  it("names an exception no call needs", () => {
    const exceptions = [
      { file: "packages/x/src/a.ts", call: "fetch", why: "Gone." },
    ];

    expect(
      deadlineProblems(
        [file("packages/x/src/a.ts", "const a = 1;")],
        exceptions,
      ),
    ).toEqual([
      "deadlines.ts excuses fetch in packages/x/src/a.ts, which has no such call without a deadline. Delete the exception.",
    ]);
  });
});

describe("robkit's packages and templates", () => {
  it("scan source and template code, not tests", async () => {
    const files = (await readOutboundCode(root)).map(({ file }) => file);

    expect(files).toContain("packages/session/src/core-access.ts");
    expect(files).toContain(
      "packages/create-robkit/templates/base/packages/core-client/src/call-core.ts",
    );
    expect(
      files.filter((path) => /\.test(-d)?\.tsx?$|\/test\//.test(path)),
    ).toEqual([]);
  });

  it("give every outbound fetch a deadline", async () => {
    expect(deadlineProblems(await readOutboundCode(root))).toEqual([]);
  });
});
