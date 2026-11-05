import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkInstall } from "./check.ts";
import { readContract } from "./contract.ts";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { drive } from "./test/drive.ts";

const bin = fileURLToPath(new URL("robkit.ts", import.meta.url));

const otherApp =
  "Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.";
const overHttp =
  "Layer rule: an app reaches core over HTTP only, never through @robkit/core.";
const viewerFromAdapter =
  "Layer rule: handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.";
const portableImports =
  "Layer rule: an app is portable. Outside its own folder it imports only its dependencies, @robkit/* packages and the install's fixed packages: @internal/ui, @internal/theme, @internal/core-client and @internal/tsconfig.";
const portableDependencies =
  "Layer rule: an app's dependencies come from npm, the catalog every install has, or the install's fixed packages. Pin any other version in the app's package.json.";

/** A written install, without its dependencies: the check reads files only. */
async function freshInstall(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-check-")), "install");
  await init(defaultChoices, dir);
  return dir;
}

/** The install with a workspace package of its own, outside the contract. */
async function installWithOwnPackage(): Promise<string> {
  const dir = await freshInstall();
  await mkdir(join(dir, "packages/mylib"), { recursive: true });
  await writeFile(
    join(dir, "packages/mylib/package.json"),
    JSON.stringify({ name: "@internal/mylib", private: true }),
  );
  return dir;
}

/** The example app's manifest with `dependencies` added. */
async function addDependencies(dir: string, dependencies: object) {
  const path = join(dir, "apps/example/package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as {
    dependencies: object;
  };
  manifest.dependencies = { ...manifest.dependencies, ...dependencies };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** The install with one file written, as an agent's change might. */
async function installWith(path: string, text: string): Promise<string> {
  const dir = await freshInstall();
  await writeFile(join(dir, path), text);
  return dir;
}

describe("checkInstall", { timeout: 30_000 }, () => {
  it("finds nothing in a fresh install", async () => {
    expect(await checkInstall(await freshInstall())).toEqual([]);
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
  ])("refuses %s, naming the rule", async (_, path, text, rule) => {
    const dir = await installWith(path, text);

    expect(await checkInstall(dir)).toEqual([
      { file: path, line: 1, column: expect.any(Number) as number, rule },
    ]);
  });

  it("names both rules for a relative import into core", async () => {
    const path = "apps/hub/src/reach.ts";
    const dir = await installWith(path, 'import "../../core/src/main.ts";\n');

    expect((await checkInstall(dir)).map((problem) => problem.rule)).toEqual([
      otherApp,
      overHttp,
    ]);
  });

  it("lets core import @robkit/core and read the session", async () => {
    const dir = await installWith(
      "apps/core/src/reach.ts",
      'import "@robkit/core";\nimport "@robkit/session";\nexport const name = "robkit_session";\n',
    );

    expect(await checkInstall(dir)).toEqual([]);
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

describe("checkInstall's portability rule", { timeout: 30_000 }, () => {
  it("refuses an app importing a workspace package outside the contract", async () => {
    const dir = await installWithOwnPackage();
    await writeFile(
      join(dir, "apps/example/src/reach.ts"),
      'import { helper } from "@internal/mylib/helper";\n',
    );

    expect(await checkInstall(dir)).toEqual([
      {
        file: "apps/example/src/reach.ts",
        line: 1,
        column: 24,
        rule: portableImports,
      },
    ]);
  });

  it("lets the hub and admin import the install's own packages", async () => {
    const dir = await installWithOwnPackage();
    await writeFile(
      join(dir, "apps/hub/src/reach.ts"),
      'import "@internal/mylib";\n',
    );

    expect(await checkInstall(dir)).toEqual([]);
  });

  it("refuses a dependency from outside npm, the contract's catalog and fixed packages", async () => {
    const dir = await installWithOwnPackage();
    await addDependencies(dir, {
      "@internal/mylib": "workspace:*",
      "left-pad": "catalog:",
      "local-thing": "file:../../local-thing",
      nanoid: "5.1.6",
    });

    const problems = await checkInstall(dir);

    expect(problems.map(({ file, rule }) => ({ file, rule }))).toEqual([
      { file: "apps/example/package.json", rule: portableDependencies },
      { file: "apps/example/package.json", rule: portableDependencies },
      { file: "apps/example/package.json", rule: portableDependencies },
    ]);
    const manifest = await readFile(
      join(dir, "apps/example/package.json"),
      "utf8",
    );
    const lineOf = (name: string) =>
      manifest.split("\n").findIndex((line) => line.includes(`"${name}"`)) + 1;
    expect(problems.map((problem) => problem.line)).toEqual([
      lineOf("@internal/mylib"),
      lineOf("left-pad"),
      lineOf("local-thing"),
    ]);
  });

  it("checks only the app it's asked about", async () => {
    const dir = await installWithOwnPackage();
    await writeFile(
      join(dir, "apps/example/src/reach.ts"),
      'import "@internal/mylib";\n',
    );

    expect(await checkInstall(dir, { only: "hub" })).toEqual([]);
    expect(await checkInstall(dir, { only: "example" })).toHaveLength(1);
  });

  it("names the contract's fixed packages in its rule", async () => {
    const { packages } = await readContract();

    expect([...packages].sort()).toEqual([
      "@internal/core-client",
      "@internal/theme",
      "@internal/tsconfig",
      "@internal/ui",
    ]);
    for (const name of packages) expect(portableImports).toContain(name);
  });
});

describe("robkit check", { timeout: 30_000 }, () => {
  it("prints nothing and exits 0 when the rule holds", async () => {
    expect(await drive(bin, await freshInstall(), ["check"])).toEqual({
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
