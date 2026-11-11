import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { robkitCommands } from "create-robkit";
import { describe, expect, it } from "vitest";
import { repoRoot, type Fence } from "./doc-examples.ts";
import {
  commandProblems,
  goFormatProblems,
  siteFences,
} from "./site-fences.ts";

const fence = (lang: string, code: string, line = 10): Fence => ({
  file: "site/src/content/docs/a.mdx",
  line,
  lang,
  flags: [],
  code,
});

const install = {
  robkit: ["add", "check"],
  scripts: ["dev", "lint", "robkit"],
};

describe("commandProblems", () => {
  it("passes robkit's commands, the install's scripts and pnpm's own", () => {
    expect(
      commandProblems(
        [
          fence(
            "sh",
            [
              "pnpm dev",
              "$ pnpm robkit add notes --stack react-hono   # it asks the rest",
              "pnpm install && pnpm run lint",
              "pnpm --version",
              "cd my-install",
              "npm create robkit my-install",
            ].join("\n"),
          ),
          fence("ts", "pnpm nothing\n"),
        ],
        install,
      ),
    ).toEqual([]);
  });

  it("names a robkit command that doesn't exist, and a missing one", () => {
    expect(
      commandProblems(
        [fence("sh", "pnpm robkit nothing\ncd x && pnpm robkit\n")],
        install,
      ),
    ).toEqual([
      "site/src/content/docs/a.mdx:10: robkit has no nothing command. Its commands are add, check.",
      "site/src/content/docs/a.mdx:11: robkit has no command there. Its commands are add, check.",
    ]);
  });

  it("names a script the install doesn't have, run or not", () => {
    expect(
      commandProblems(
        [fence("sh", "pnpm start\npnpm run deploy | cat\n", 3)],
        install,
      ),
    ).toEqual([
      "site/src/content/docs/a.mdx:3: an install's package.json has no start script, and it isn't one of pnpm's own commands. Its scripts are dev, lint, robkit.",
      "site/src/content/docs/a.mdx:4: an install's package.json has no deploy script, and it isn't one of pnpm's own commands. Its scripts are dev, lint, robkit.",
    ]);
  });
});

describe("goFormatProblems", () => {
  it("passes Go as gofmt writes it, and names Go it would change or can't read", () => {
    const formatted =
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}\n';

    expect(
      goFormatProblems([
        fence("go", formatted, 1),
        fence("go", formatted.replace("\tfmt", "    fmt"), 2),
        fence("go", "package main\n\nfunc main( {\n", 3),
        fence("sh", "not go at all\n", 4),
      ]),
    ).toEqual([
      "site/src/content/docs/a.mdx:2: gofmt would change it. Run the code through gofmt.",
      expect.stringMatching(
        /^site\/src\/content\/docs\/a\.mdx:3: gofmt can't read it: /,
      ),
    ]);
  });
});

describe("the site's pages", async () => {
  const fences = await siteFences(repoRoot);
  const { scripts } = JSON.parse(
    await readFile(
      join(repoRoot, "packages/create-robkit/templates/base/package.json"),
      "utf8",
    ),
  ) as { scripts: Record<string, string> };

  it("show only commands robkit runs and scripts an install has", () => {
    expect(fences.filter(({ lang }) => lang === "sh").length).toBeGreaterThan(
      0,
    );
    expect(
      commandProblems(fences, {
        robkit: robkitCommands,
        scripts: Object.keys(scripts),
      }),
    ).toEqual([]);
  });

  it("show Go as gofmt writes it", () => {
    expect(goFormatProblems(fences)).toEqual([]);
  });
});
