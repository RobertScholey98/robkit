import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
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
  it("reads the site's pages, and not its style guide, config or build", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "robkit-doc-examples-"));
    onTestFinished(() => rm(fixture, { recursive: true, force: true }));
    const fence = "```ts\nconst a: number = 1;\n```\n";
    const files = {
      "site/src/content/docs/get-started/a.mdx": `---\ntitle: A\n---\n\n${fence}`,
      "site/src/pages/b.mdx": fence,
      "site/src/pages/c.astro": fence,
      "site/DESIGN.md": fence,
      "site/astro.config.ts": fence,
      "site/dist/docs/a/index.md": fence,
      "site/.astro/notes.mdx": fence,
      "site/node_modules/x/README.mdx": fence,
    };
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(fixture, path)), { recursive: true });
      await writeFile(join(fixture, path), text);
    }

    expect(
      (await docExamples(fixture)).map(({ file, line }) => [file, line]),
    ).toEqual([
      ["site/src/content/docs/get-started/a.mdx", 6],
      ["site/src/pages/b.mdx", 2],
      ["site/src/pages/c.astro", 2],
    ]);
  });

  it("names a site page and line whose example doesn't compile, and compiles a tsx one with React", async () => {
    const page = (lang: string, code: string) =>
      `---\ntitle: A\n---\n\nSome text.\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    const fixture = await mkdtemp(join(tmpdir(), "robkit-doc-examples-"));
    onTestFinished(() => rm(fixture, { recursive: true, force: true }));
    const docs = join(fixture, "site/src/content/docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      join(docs, "bad.mdx"),
      page(
        "ts",
        'import { type Slug } from "@robkit/input";\n\nexport const slug: Slug = "notes";',
      ),
    );
    await writeFile(
      join(docs, "react.mdx"),
      page(
        "tsx",
        [
          'import { useState } from "react";',
          "",
          "export function Counter() {",
          "  const [count, setCount] = useState(0);",
          "  return <button onClick={() => setCount(count + 1)}>{count}</button>;",
          "}",
        ].join("\n"),
      ),
    );

    const problems = await exampleProblems(
      repoRoot,
      await docExamples(fixture),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^site\/src\/content\/docs\/bad\.mdx:10: Type '"notes"' is not assignable to type 'Slug'\./,
    );
  }, 120_000);

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
