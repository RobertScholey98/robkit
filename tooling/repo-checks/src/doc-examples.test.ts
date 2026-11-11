import { describe, expect, it } from "vitest";
import {
  docExamples,
  examplesIn,
  exampleProblems,
  repoRoot,
} from "./doc-examples.ts";

describe("examplesIn", () => {
  it("finds each ts and tsx fence with the line its code starts on", () => {
    const markdown = [
      "# A package", // 1
      "", // 2
      "```ts", // 3
      'import { guard } from "@robkit/guard";', // 4
      "```", // 5
      "", // 6
      "1. A step:", // 7
      "", // 8
      "   ```tsx", // 9
      "   const a = <p />;", // 10
      "   ```", // 11
      "", // 12
      "```sh", // 13
      "pnpm install", // 14
      "```", // 15
    ].join("\n");

    expect(examplesIn("packages/x/README.md", markdown)).toEqual([
      {
        file: "packages/x/README.md",
        line: 4,
        lang: "ts",
        code: 'import { guard } from "@robkit/guard";\n',
      },
      {
        file: "packages/x/README.md",
        line: 10,
        lang: "tsx",
        code: "const a = <p />;\n",
      },
    ]);
  });

  it("skips a fence marked nocheck", () => {
    const markdown = ["```ts nocheck", "{ kind: 'open' },", "```"].join("\n");

    expect(examplesIn("CONTRIBUTING.md", markdown)).toEqual([]);
  });
});

describe("exampleProblems", () => {
  it("names the file and line of an example that doesn't compile, and how to mark a fragment", async () => {
    const problems = await exampleProblems(repoRoot, [
      {
        file: "packages/x/README.md",
        line: 12,
        lang: "ts",
        code: [
          'import { readSlug, type Slug } from "@robkit/input";',
          "",
          'const good = readSlug("notes");',
          'const bad: Slug = "notes";',
          "",
        ].join("\n"),
      },
    ]);

    expect(problems).toEqual([
      `packages/x/README.md:15: Type '"notes"' is not assignable to type 'Slug'.\n` +
        "  Make the example compile against the built packages. If it is deliberately not a whole program, such as a signature or a fragment, mark its fence ```ts nocheck.",
    ]);
  }, 120_000);

  it("passes an example that compiles", async () => {
    expect(
      await exampleProblems(repoRoot, [
        {
          file: "README.md",
          line: 1,
          lang: "ts",
          code: 'import { readSlug } from "@robkit/input";\nreadSlug("notes");\n',
        },
      ]),
    ).toEqual([]);
  }, 120_000);
});

describe("docExamples", () => {
  it("reads the package READMEs", async () => {
    const examples = await docExamples(repoRoot);

    expect(examples.map(({ file }) => file)).toContain(
      "packages/session/README.md",
    );
  });
});

describe("the docs' TypeScript examples", async () => {
  const examples = await docExamples(repoRoot);

  // Fails when an example drifts from the API. Fix the example, or mark a
  // fence that isn't a whole program ```ts nocheck.
  // It compiles every example in every README, so it grows with each
  // package. On a busy CI runner it passed the suite's 30 seconds.
  it("compile against the built packages", async () => {
    expect(await exampleProblems(repoRoot, examples)).toEqual([]);
  }, 120_000);
});
