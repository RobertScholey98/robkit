import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  avoidWords,
  exceptions,
  type Exceptions,
  glossaryProblems,
  readScannedFiles,
  unusedExceptions,
} from "./glossary.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const glossary = [
  "## Language",
  "",
  "**Owner**:",
  "The one person who runs an install.",
  "_Avoid_: admin (for the person), user",
  "",
  "**Intro link**:",
  "A link that signs a guest in.",
  "_Avoid_: magic link",
  "",
  "**Platform apps**:",
  "Core, the hub and admin together.",
].join("\n");

describe("avoidWords", () => {
  it("reads each term's Avoid words, without their qualifiers", () => {
    expect(avoidWords(glossary)).toEqual([
      { term: "Owner", word: "admin" },
      { term: "Owner", word: "user" },
      { term: "Intro link", word: "magic link" },
    ]);
  });
});

describe("glossaryProblems", () => {
  const words = avoidWords(glossary);
  const none = { everywhere: {}, at: [] };

  it("names each Avoid word, its line and the term to use", () => {
    const files = [
      {
        file: "docs/a.md",
        text: "Send the User a Magic\nlink.\nEach user, and the users too.",
      },
    ];

    expect(glossaryProblems(files, words, none)).toEqual([
      'docs/a.md:1 says "User", which GLOSSARY.md avoids. Say "Owner" instead.',
      'docs/a.md:1 says "Magic link", which GLOSSARY.md avoids. Say "Intro link" instead.',
      'docs/a.md:3 says "user", which GLOSSARY.md avoids. Say "Owner" instead.',
      'docs/a.md:3 says "users", which GLOSSARY.md avoids. Say "Owner" instead.',
    ]);
  });

  it("matches whole words, so a longer word or a kebab-case name passes", () => {
    const files = [
      {
        file: "packages/x/src/a.ts",
        text: 'const username = "cancelled-by-user"; // userland',
      },
    ];

    expect(glossaryProblems(files, words, none)).toEqual([]);
  });

  it("skips a word excepted everywhere, and a line excepted by its text", () => {
    const files = [
      { file: "docs/a.md", text: "Open admin.\nAs the admin user.\nA user." },
      { file: "docs/b.md", text: "As the admin user." },
    ];

    expect(
      glossaryProblems(files, words, {
        everywhere: { admin: "Admin is also the platform app." },
        at: [
          {
            word: "user",
            file: "docs/a.md",
            text: "As the admin user.",
            why: "A quote.",
          },
        ],
      }),
    ).toEqual([
      'docs/a.md:3 says "user", which GLOSSARY.md avoids. Say "Owner" instead.',
      'docs/b.md:1 says "user", which GLOSSARY.md avoids. Say "Owner" instead.',
    ]);
  });

  it("matches an exception's file as a glob, and any file without one", () => {
    const files = [
      { file: "packages/hono/src/a.ts", text: "a user" },
      { file: "packages/start/src/a.ts", text: "a user" },
      { file: "docs/a.md", text: "a user" },
    ];

    expect(
      glossaryProblems(files, words, {
        everywhere: {},
        at: [
          {
            word: "user",
            file: "packages/{hono,start}/src/**",
            text: "a user",
            why: "The framework's word.",
          },
        ],
      }),
    ).toEqual([
      'docs/a.md:1 says "user", which GLOSSARY.md avoids. Say "Owner" instead.',
    ]);
    expect(
      glossaryProblems(files, words, {
        everywhere: {},
        at: [{ word: "user", text: "a user", why: "Everywhere." }],
      }),
    ).toEqual([]);
  });
});

describe("unusedExceptions", () => {
  it("names an exception no line needs, and one for a word the glossary doesn't avoid", () => {
    const words = avoidWords(glossary);
    const files = [{ file: "docs/a.md", text: "A user." }];

    expect(
      unusedExceptions(files, words, {
        everywhere: { cookie: "Gone from the glossary." },
        at: [
          { word: "user", file: "docs/a.md", text: "A user.", why: "Used." },
          { word: "user", text: "Moved away.", why: "Stale." },
        ],
      }),
    ).toEqual([
      'The exception for "cookie" everywhere names a word GLOSSARY.md doesn\'t avoid. Delete it from tooling/repo-checks/src/glossary.ts.',
      'The exception for "user" at "Moved away." matches no line. Delete it from tooling/repo-checks/src/glossary.ts.',
    ]);
  });
});

const noExceptions: Exceptions = { everywhere: {}, at: [] };

describe("readScannedFiles", () => {
  it("reads the templates' source, so an Avoid word in an install's code fails", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "robkit-glossary-"));
    onTestFinished(() => rm(fixture, { recursive: true, force: true }));
    const hub = join(fixture, "packages/create-robkit/templates/base/apps/hub");
    await mkdir(join(hub, "src"), { recursive: true });
    await writeFile(
      join(hub, "src/intro.ts"),
      "// Signs a guest in with a magic link.\n",
    );
    await writeFile(join(hub, "index.html"), "<title>Magic link</title>\n");

    const files = await readScannedFiles(fixture);

    expect(glossaryProblems(files, avoidWords(glossary), noExceptions)).toEqual(
      [
        'packages/create-robkit/templates/base/apps/hub/index.html:1 says "Magic link", which GLOSSARY.md avoids. Say "Intro link" instead.',
        'packages/create-robkit/templates/base/apps/hub/src/intro.ts:1 says "magic link", which GLOSSARY.md avoids. Say "Intro link" instead.',
      ],
    );
  });
});

describe("the robkit repo", () => {
  it("uses none of the glossary's Avoid words outside its exceptions", async () => {
    const words = avoidWords(await readFile(join(root, "GLOSSARY.md"), "utf8"));
    const files = await readScannedFiles(root);

    expect(words.length).toBeGreaterThan(20);
    expect(files.length).toBeGreaterThan(100);
    expect(glossaryProblems(files, words, exceptions)).toEqual([]);
    expect(unusedExceptions(files, words, exceptions)).toEqual([]);
  });
});
