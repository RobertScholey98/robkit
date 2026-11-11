import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkInstall } from "./check.ts";
import { defaultChoices, readyStacks } from "./choices.ts";
import { init } from "./init.ts";
import { drive } from "./test/drive.ts";

const bin = fileURLToPath(new URL("robkit-command.ts", import.meta.url));

const otherApp =
  "Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.";
const sharedImports =
  "Layer rule: a shared package imports only its own files, @robkit/* packages and other shared packages/*. It never imports an app.";
const overHttp =
  "Layer rule: an app or shared package reaches core over HTTP only, never through @robkit/core.";
const viewerFromAdapter =
  "Layer rule: handlers take the viewer from their adapter. No app or shared package reads the session cookie or verifies a token itself.";
const readFolders =
  "Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.";

/** A written install, without its dependencies: the check reads files only. */
async function freshInstall(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-check-")), "install");
  await init(defaultChoices, dir, { install: false });
  return dir;
}

let readOnly: Promise<string> | undefined;

/** One fresh install, made on first use, for the tests that only read it. */
function readOnlyInstall(): Promise<string> {
  readOnly ??= freshInstall();
  return readOnly;
}

/** The install with one file written, as an agent's change might. */
async function installWith(path: string, text: string): Promise<string> {
  const dir = await freshInstall();
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), text);
  return dir;
}

describe("checkInstall", () => {
  it("finds nothing in a fresh install", async () => {
    expect(await checkInstall(await readOnlyInstall())).toEqual([]);
  });

  it.each(readyStacks)(
    "finds nothing in a fresh install whose example is on %s",
    async (exampleStack) => {
      const dir = join(
        await mkdtemp(join(tmpdir(), "robkit-check-")),
        exampleStack,
      );
      await init({ exampleStack }, dir, { install: false });

      expect(await checkInstall(dir)).toEqual([]);
    },
  );

  it.each([
    [
      "an app importing another app's files",
      "apps/hub/src/reach.ts",
      'import { recordVisit } from "../../example/src/visits.ts";\n',
      otherApp,
    ],
    [
      "an app importing another app by its package name",
      "apps/example/src/reach.ts",
      'export * from "@internal/hub-app";\n',
      otherApp,
    ],
    [
      "an app importing a file outside every app",
      "apps/example/src/reach.ts",
      'import "../../../packages/core-client/src/call-core.ts";\n',
      otherApp,
    ],
    [
      "an app importing @robkit/core",
      "apps/example/src/reach.ts",
      'import { createCore } from "@robkit/core";\n',
      overHttp,
    ],
    [
      "an app loading a @robkit/core subpath on demand",
      "apps/admin/src/reach.ts",
      'export const core = () => import("@robkit/core/schema");\n',
      overHttp,
    ],
    [
      "an app verifying the token with @robkit/session",
      "apps/example/src/reach.ts",
      'import { readSessionToken } from "@robkit/session";\n',
      viewerFromAdapter,
    ],
    [
      "an app verifying the token with jose",
      "apps/example/src/reach.ts",
      'import { jwtVerify } from "jose";\n',
      viewerFromAdapter,
    ],
    [
      "an app reading the session cookie by its plain name",
      "apps/example/src/reach.ts",
      'export const token = (cookie: string) => cookie.split("robkit_session=")[1];\n',
      viewerFromAdapter,
    ],
    [
      "an app reading the session cookie by its __Host- name",
      "apps/example/src/reach.ts",
      'export const token = (cookie: string) => cookie.split("__Host-robkit_session=")[1];\n',
      viewerFromAdapter,
    ],
    [
      "a shared package importing @robkit/core",
      "packages/core-client/src/reach.ts",
      'import { createCore } from "@robkit/core";\n',
      overHttp,
    ],
    [
      "a shared package importing an app by its package name",
      "packages/ui/src/reach.ts",
      'export * from "@internal/hub-app";\n',
      sharedImports,
    ],
    [
      "a shared package importing an app's files",
      "packages/core-client/src/reach.ts",
      'import "../../../apps/example/src/visits.ts";\n',
      sharedImports,
    ],
    [
      "a shared package verifying the token with jose",
      "packages/ui/src/reach.ts",
      'import { jwtVerify } from "jose";\n',
      viewerFromAdapter,
    ],
  ])("refuses %s, naming the rule", async (_, path, text, rule) => {
    const dir = await installWith(path, text);

    expect(await checkInstall(dir)).toEqual([
      { file: path, line: 1, column: expect.any(Number) as number, rule },
    ]);
  });

  it("names both rules for a relative import into core", async () => {
    const path = "apps/hub/src/reach.ts";
    const dir = await installWith(path, 'import "../../core/src/main.ts";\n');

    expect(
      (await checkInstall(dir)).map((violation) => violation.rule),
    ).toEqual([otherApp, overHttp]);
  });

  it("lets a shared package import its own files and other shared packages", async () => {
    const dir = await installWith(
      "packages/ui/src/reach.ts",
      'import "./lib/utils.ts";\nimport "@internal/core-client";\nimport "@robkit/session/addresses";\n',
    );

    expect(await checkInstall(dir)).toEqual([]);
  });

  // apps/core has no source, but an owner who writes their own core gives
  // it some.
  it("lets core import @robkit/core and read the session", async () => {
    const dir = await installWith(
      "apps/core/src/reach.ts",
      'import "@robkit/core";\nimport "@robkit/session";\nexport const name = "robkit_session";\n',
    );

    expect(await checkInstall(dir)).toEqual([]);
  });

  it("refuses an app whose package.json won't do, naming it", async () => {
    const dir = await installWith("apps/hub/package.json", '{"name": 1}');

    await expect(checkInstall(dir)).rejects.toThrow(
      'apps/hub/package.json: name must be a string, such as "@internal/notes-app".',
    );
  });

  it.each([
    ["a string", 'package main\n\nconst cookie = "robkit_session"\n', 16],
    ["a raw string", "package main\n\nvar cookie = `robkit_session`\n", 14],
    [
      "an escaped string",
      'package main\n\nconst c = "robkit\\x5fsession"\n',
      11,
    ],
  ])(
    "refuses a Go app reading the session cookie from %s, naming where it starts",
    async (_, text, column) => {
      const dir = await installWith("apps/example/cookie.go", text);

      expect(await checkInstall(dir)).toEqual([
        {
          file: "apps/example/cookie.go",
          line: 3,
          column,
          rule: viewerFromAdapter,
        },
      ]);
    },
  );

  it("reads a Go file's comments, runes and strings as Go does", async () => {
    const dir = await installWith(
      "apps/example/cookie.go",
      [
        "package main",
        '// "robkit_session" in a comment',
        "/* `robkit_session`",
        "   across lines */",
        "var quote, backslash = '\"', '\\\\'",
        'var path = "C:\\\\" + `',
        '"`',
        'var cookie = "robkit_session"',
        "",
      ].join("\n"),
    );

    expect(await checkInstall(dir)).toEqual([
      {
        file: "apps/example/cookie.go",
        line: 8,
        column: 14,
        rule: viewerFromAdapter,
      },
    ]);
  });

  it("checks .tsx and .js files, and skips node_modules", async () => {
    const dir = await installWith(
      "apps/example/src/reach.tsx",
      'import "@robkit/core";\nexport const Page = () => <p>hi</p>;\n',
    );
    await writeFile(
      join(dir, "apps/example/reach.js"),
      'require("@robkit/core");\n',
    );
    await mkdir(join(dir, "apps/example/node_modules/dep"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "apps/example/node_modules/dep/index.js"),
      'require("@robkit/core");\n',
    );

    expect(await checkInstall(dir)).toEqual([
      expect.objectContaining({ file: "apps/example/reach.js" }),
      expect.objectContaining({ file: "apps/example/src/reach.tsx", line: 1 }),
    ]);
  });

  it.each([
    ["node_modules", "apps/example/src", "./node_modules/dep/index.js"],
    ["dist", "apps/example/src", "../dist/server.js"],
    ["build", "apps/example/src", "./build/server.js"],
    ["a dot-folder", "apps/example/src", "./.cache/server.js"],
    ["dist, from a shared package", "packages/ui/src", "../dist/index.js"],
  ])(
    "refuses a relative import into %s, which it doesn't read",
    async (_, folder, specifier) => {
      const dir = await installWith(
        `${folder}/reach.ts`,
        `// Hidden from the check.\nimport "${specifier}";\n`,
      );
      const hidden = join(dir, folder, specifier);
      await mkdir(dirname(hidden), { recursive: true });
      await writeFile(hidden, 'require("@robkit/core");\n');

      expect(await checkInstall(dir)).toEqual([
        { file: `${folder}/reach.ts`, line: 2, column: 8, rule: readFolders },
      ]);
    },
  );

  it.each([
    ["the folder it imports", "./linked", "linked"],
    ["the first folder along its path", "./linked/server.ts", "linked"],
    ["a folder part-way along its path", "./a/linked/server.ts", "a/linked"],
  ])(
    "refuses a relative import through a symlink at %s",
    async (_, specifier, linked) => {
      const dir = await installWith(
        "apps/example/src/reach.ts",
        `import "${specifier}";\n`,
      );
      await mkdir(join(dir, "elsewhere"));
      await writeFile(
        join(dir, "elsewhere/server.ts"),
        'import "@robkit/core";\n',
      );
      await writeFile(
        join(dir, "elsewhere/index.ts"),
        'import "@robkit/core";\n',
      );
      const link = join(dir, "apps/example/src", linked);
      await mkdir(dirname(link), { recursive: true });
      // A junction on Windows, which needs no admin rights; a symlink elsewhere.
      await symlink(join(dir, "elsewhere"), link, "junction");

      expect(await checkInstall(dir)).toEqual([
        {
          file: "apps/example/src/reach.ts",
          line: 1,
          column: 8,
          rule: readFolders,
        },
      ]);
    },
  );

  it("names only the rule for leaving the app when an import leaves the install", async () => {
    const path = "apps/example/src/reach.ts";
    const dir = await installWith(path, 'import "../../../../.cache/x.ts";\n');

    expect(
      (await checkInstall(dir)).map((violation) => violation.rule),
    ).toEqual([otherApp]);
  });

  it("lets an app import a file named like a folder it skips", async () => {
    const dir = await installWith(
      "apps/example/src/reach.ts",
      'import "./build.ts";\nimport "./dist-names/x.ts";\nimport "./build.ts/x.ts";\n',
    );
    await writeFile(join(dir, "apps/example/src/build.ts"), "");
    await mkdir(join(dir, "apps/example/src/dist-names"));
    await writeFile(join(dir, "apps/example/src/dist-names/x.ts"), "");

    expect(await checkInstall(dir)).toEqual([]);
  });
});

describe("robkit check", () => {
  it("prints nothing and exits 0 when the rule holds", async () => {
    expect(await drive(bin, await readOnlyInstall(), ["check"])).toEqual({
      code: 0,
      output: "",
    });
  });

  it("names each problem's place and rule, and exits 1", async () => {
    const dir = await installWith(
      "apps/example/src/reach.ts",
      '// Reaches into core.\nimport { createCore } from "@robkit/core";\n',
    );

    expect(await drive(bin, dir, ["check"])).toEqual({
      code: 1,
      output: `apps/example/src/reach.ts:2:28  ${overHttp}\n`,
    });
  });

  it("says where an import into a skipped folder is, and what to do", async () => {
    const dir = await installWith(
      "apps/example/src/reach.ts",
      'import "./dist/server.js";\n',
    );

    expect(await drive(bin, dir, ["check"])).toEqual({
      code: 1,
      output:
        "apps/example/src/reach.ts:1:8  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.\n",
    });
  });
});
