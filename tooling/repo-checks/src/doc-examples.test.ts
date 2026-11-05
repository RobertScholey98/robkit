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
          'import { readSlug, type Slug } from "@robkit/session/addresses";',
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
  });

  it("passes an example that compiles", async () => {
    expect(
      await exampleProblems(repoRoot, [
        {
          file: "README.md",
          line: 1,
          lang: "ts",
          code: 'import { readSlug } from "@robkit/session/addresses";\nreadSlug("notes");\n',
        },
      ]),
    ).toEqual([]);
  });
});

describe("docExamples", () => {
  it("reads the package READMEs", async () => {
    const examples = await docExamples(repoRoot);

    expect(examples.map(({ file }) => file)).toContain(
      "packages/session/README.md",
    );
  });
});

// Tickets 08 and 10 own these docs in round 2's first wave, so their
// fragments get marked `ts nocheck` once those merge. Take a doc off this
// list when its examples compile, and this check covers it again.
const awaitingTheirOwners = [
  "docs/conventions/errors.md",
  "docs/conventions/input.md",
];

describe("the docs' TypeScript examples", async () => {
  const examples = await docExamples(repoRoot);
  const [pending, checked] = [
    examples.filter(({ file }) => awaitingTheirOwners.includes(file)),
    examples.filter(({ file }) => !awaitingTheirOwners.includes(file)),
  ];

  // Fails when an example drifts from the API. Fix the example, or mark a
  // fence that isn't a whole program ```ts nocheck.
  it("compile against the built packages", async () => {
    expect(await exampleProblems(repoRoot, checked)).toEqual([]);
  });

  it.each(awaitingTheirOwners)(
    "%s still has examples that don't compile; once it has none, take it off awaitingTheirOwners",
    async (file) => {
      const problems = await exampleProblems(
        repoRoot,
        pending.filter((example) => example.file === file),
      );
      expect(problems).not.toEqual([]);
    },
  );
});
