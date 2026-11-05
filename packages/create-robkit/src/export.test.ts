import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { addApp, type AppChoices } from "./add.ts";
import { defaultChoices, readyStacks, type Stack } from "./choices.ts";
import { exportApp } from "./export.ts";
import { init } from "./init.ts";
import { readTree } from "./sharing.ts";

const run = promisify(execFile);

/** A written install, without its dependencies, at `<temp>/install`. */
async function freshInstall(options: { link?: boolean } = {}) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir, options);
  return dir;
}

const notes = (stack: Stack = "start"): AppChoices => ({
  stack,
  slug: "notes",
  access: { kind: "open" },
  icon: "📝",
});

async function text(...path: string[]): Promise<string> {
  return readFile(join(...path), "utf8");
}

async function json(...path: string[]): Promise<Record<string, unknown>> {
  return JSON.parse(await text(...path)) as Record<string, unknown>;
}

async function catalogOf(install: string): Promise<Record<string, string>> {
  return (
    parse(await text(install, "pnpm-workspace.yaml"), {
      schema: "failsafe",
    }) as { catalog: Record<string, string> }
  ).catalog;
}

async function gitLog(dir: string): Promise<string[]> {
  const { stdout } = await run("git", ["log", "--format=%s"], { cwd: dir });
  return stdout.trim().split("\n");
}

describe("exportApp", { timeout: 30_000 }, () => {
  it("writes the app's own files beside the install, as a repo of its own", async () => {
    const install = await freshInstall();
    await addApp(install, notes());

    const exported = await exportApp(install, "notes");

    const out = join(install, "..", "notes");
    expect(exported).toEqual({
      dir: out,
      shared: ["@internal/ui", "@internal/tsconfig", "@internal/theme"],
      committed: true,
    });
    const app = await readTree(join(install, "apps/notes"));
    const repo = await readTree(out);
    for (const [path, bytes] of app) {
      if (path === "package.json") continue;
      expect(repo.get(path)?.toString(), path).toBe(bytes.toString());
    }
    expect(await gitLog(out)).toEqual(["Export notes from a robkit install"]);
  });

  it("copies the install code the app uses into shared/, with the imports still finding it", async () => {
    const install = await freshInstall();
    await addApp(install, notes());

    const { dir } = await exportApp(install, "notes");

    for (const [from, to] of [
      ["packages/ui", "shared/ui"],
      ["packages/theme", "shared/theme"],
      ["tooling/typescript", "shared/tsconfig"],
    ] as const) {
      const original = await readTree(join(install, from));
      const copy = await readTree(join(dir, to));
      expect([...copy.keys()]).toEqual([...original.keys()]);
      for (const [path, bytes] of original) {
        if (path === "package.json") continue;
        expect(copy.get(path)?.toString(), `${to}/${path}`).toBe(
          bytes.toString(),
        );
      }
    }
    expect(parse(await text(dir, "pnpm-workspace.yaml"))).toMatchObject({
      packages: ["shared/*"],
    });
    expect(await json(dir, "package.json")).toMatchObject({
      dependencies: { "@internal/ui": "workspace:*" },
      devDependencies: { "@internal/tsconfig": "workspace:*" },
    });
    expect(await json(dir, "shared/ui/package.json")).toMatchObject({
      name: "@internal/ui",
      dependencies: { "@internal/theme": "workspace:*" },
    });
  });

  it("writes out the catalog's versions, so the repo installs on its own", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    const catalog = await catalogOf(install);

    const { dir } = await exportApp(install, "notes");

    const manifest = await json(dir, "package.json");
    expect(manifest).toMatchObject({
      name: "@internal/notes-app",
      packageManager: (await json(install, "package.json")).packageManager,
      dependencies: {
        "@robkit/start": catalog["@robkit/start"],
        react: catalog.react,
      },
      devDependencies: { vite: catalog.vite },
    });
    expect(await json(dir, "shared/ui/package.json")).toMatchObject({
      dependencies: { "@base-ui/react": catalog["@base-ui/react"] },
    });
    expect(JSON.stringify(manifest)).not.toContain("catalog:");
  });

  it("names the contract version and gives the app scripts that lint and test it on its own", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    const catalog = await catalogOf(install);

    const { dir } = await exportApp(install, "notes");

    expect(await json(dir, "package.json")).toMatchObject({
      scripts: { lint: "eslint .", test: "vitest run", typecheck: "tsc" },
      devDependencies: {
        eslint: catalog.eslint,
        "typescript-eslint": catalog["typescript-eslint"],
        vitest: catalog.vitest,
      },
      robkit: {
        name: "notes",
        stack: "start",
        contract: 1,
        access: { kind: "open" },
        icon: "📝",
      },
    });
    expect(await text(dir, "eslint.config.js")).toContain(
      await text(install, "eslint.config.js"),
    );
    expect(await text(dir, "vitest.config.ts")).toContain(
      "passWithNoTests: true",
    );
    expect(await text(dir, "README.md")).toContain(
      "pnpm robkit import <this repo's folder or git URL>",
    );
  });

  it("copies a workspace package the app imports without listing it, and lists it", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    await writeFile(
      join(install, "apps/notes/src/core.ts"),
      'export { callCore } from "@internal/core-client";\n',
    );

    const { dir, shared } = await exportApp(install, "notes");

    expect(shared).toContain("@internal/core-client");
    expect(await json(dir, "package.json")).toMatchObject({
      dependencies: { "@internal/core-client": "workspace:*" },
    });
    expect(await text(dir, "shared/core-client/src/call-core.ts")).toBe(
      await text(install, "packages/core-client/src/call-core.ts"),
    );
  });

  it("leaves out what pnpm, builds and secrets leave behind", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    for (const path of ["node_modules/x/index.js", "dist/serve.js", ".env"]) {
      await mkdir(join(install, "apps/notes", path, ".."), { recursive: true });
      await writeFile(join(install, "apps/notes", path), "left out\n");
    }

    const { dir } = await exportApp(install, "notes");

    const paths = [...(await readTree(dir)).keys()];
    expect(
      paths.filter((path) => /node_modules|dist|\.env/.test(path)),
    ).toEqual([]);
  });

  it("takes robkit's packages from where a linked install takes them", async () => {
    const install = await freshInstall({ link: true });
    await addApp(install, notes());
    const overrides = (
      parse(await text(install, "pnpm-workspace.yaml")) as {
        overrides: Record<string, string>;
      }
    ).overrides;

    const { dir } = await exportApp(install, "notes");

    expect(parse(await text(dir, "pnpm-workspace.yaml"))).toMatchObject({
      overrides: { "@robkit/start": overrides["@robkit/start"] },
    });
    expect(await text(dir, "README.md")).toContain(
      "Until robkit's packages are on npm",
    );
  });

  it("commits each later export's changes to the same repo", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    const { dir } = await exportApp(install, "notes");
    await writeFile(join(install, "apps/notes/src/later.ts"), "export {};\n");

    const again = await exportApp(install, "notes");
    const unchanged = await exportApp(install, "notes");

    expect([again.committed, unchanged.committed]).toEqual([true, false]);
    expect(await gitLog(dir)).toEqual([
      "Export notes again",
      "Export notes from a robkit install",
    ]);
    const { stdout } = await run("git", ["show", "--stat", "--format="], {
      cwd: dir,
    });
    expect(stdout).toContain("src/later.ts");
  });

  it("drops a file the app no longer has from the next export", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    await writeFile(join(install, "apps/notes/src/gone.ts"), "export {};\n");
    const { dir } = await exportApp(install, "notes");
    await rm(join(install, "apps/notes/src/gone.ts"));

    await exportApp(install, "notes");

    expect((await readTree(dir)).has("src/gone.ts")).toBe(false);
  });

  it("writes to --out when given", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    const out = join(await mkdtemp(join(tmpdir(), "robkit-")), "elsewhere");

    const { dir } = await exportApp(install, "notes", { out });

    expect(dir).toBe(out);
    expect(await json(out, "package.json")).toMatchObject({
      name: "@internal/notes-app",
    });
  });

  it.each(readyStacks)("exports an app on the %s stack", async (stack) => {
    const install = await freshInstall();
    await addApp(install, notes(stack));

    const { dir } = await exportApp(install, "notes");

    expect(await json(dir, "package.json")).toMatchObject({
      robkit: { stack },
    });
  });

  it.each([
    [
      "hub",
      "hub is one of the platform apps every install has, so it isn't exported.",
    ],
    ["nowhere", "apps/nowhere doesn't exist in this install."],
  ])("refuses to export %s", async (slug, message) => {
    const install = await freshInstall();

    await expect(exportApp(install, slug)).rejects.toThrow(message);
  });

  it("refuses an app that breaks the layer rule", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    await writeFile(
      join(install, "apps/notes/src/reach.ts"),
      'export * from "@robkit/core";\n',
    );

    await expect(exportApp(install, "notes")).rejects.toThrow(
      "apps/notes breaks the layer rule, so it can't leave the install:\napps/notes/src/reach.ts:1:15  Layer rule: an app reaches core over HTTP only, never through @robkit/core.",
    );
  });

  it("refuses a folder that holds something else", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    const out = join(install, "..", "notes");
    await mkdir(out);
    await writeFile(join(out, "diary.txt"), "mine\n");

    await expect(exportApp(install, "notes")).rejects.toThrow(
      `${out} isn't empty and isn't a git repository. Choose another folder with --out.`,
    );
  });

  it("refuses a repo that holds another app", async () => {
    const install = await freshInstall();
    await addApp(install, notes());
    await addApp(install, { ...notes(), slug: "diary" });
    const out = join(install, "..", "shared-out");
    await exportApp(install, "diary", { out });

    await expect(exportApp(install, "notes", { out })).rejects.toThrow(
      `${out} holds another app, @internal/diary-app. Choose another folder with --out.`,
    );
  });
});
