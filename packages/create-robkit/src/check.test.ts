import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkInstall } from "./check.ts";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { drive } from "./test/drive.ts";

const bin = fileURLToPath(new URL("robkit.ts", import.meta.url));

const otherApp =
  "Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.";
const sharedImports =
  "Layer rule: a shared package imports only its own files, @robkit/* packages and other shared packages/*. It never imports an app.";
const overHttp =
  "Layer rule: an app or shared package reaches core over HTTP only, never through @robkit/core.";
const viewerFromAdapter =
  "Layer rule: handlers take the viewer from their adapter. No app or shared package reads the session cookie or verifies a token itself.";

/** A written install, without its dependencies: the check reads files only. */
async function freshInstall(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-check-")), "install");
  await init(defaultChoices, dir);
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
  await writeFile(join(dir, path), text);
  return dir;
}

describe("checkInstall", () => {
  it("finds nothing in a fresh install", async () => {
    expect(await checkInstall(await readOnlyInstall())).toEqual([]);
  });

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
      "an app reading the session cookie",
      "apps/example/src/reach.ts",
      'export const token = (cookie: string) => cookie.split("robkit_session=")[1];\n',
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
});
