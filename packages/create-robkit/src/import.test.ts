import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { addApp, type AppChoices } from "./add.ts";
import { defaultChoices, readyStacks, type Stack } from "./choices.ts";
import { exportApp } from "./export.ts";
import { importApp } from "./import.ts";
import { init } from "./init.ts";
import { readTree } from "./sharing.ts";

const run = promisify(execFile);

/** A written install, without its dependencies, at `<temp>/<name>`. */
async function freshInstall(name = "install") {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), name);
  await init(defaultChoices, dir);
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

async function settings(install: string) {
  return parse(await text(install, "pnpm-workspace.yaml"), {
    schema: "failsafe",
  }) as { packages: string[]; catalog: Record<string, string> };
}

/** Install A with `notes` added, exported to a repo; returns both. */
async function exported(
  stack: Stack = "start",
  edit?: (a: string) => Promise<void>,
) {
  const a = await freshInstall("a");
  await addApp(a, notes(stack));
  await edit?.(a);
  const { dir } = await exportApp(a, "notes");
  return { a, repo: dir };
}

/** Edits the manifest at `path` in place. */
async function editManifest(
  path: string,
  edit: (manifest: Record<string, unknown>) => void,
) {
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  edit(manifest);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("importApp", { timeout: 30_000 }, () => {
  it("brings an exported app into a fresh install as it was in the first", async () => {
    const { a, repo } = await exported();
    const b = await freshInstall("b");
    const before = await text(b, "pnpm-workspace.yaml");

    const imported = await importApp(b, repo);

    expect(imported).toEqual({
      slug: "notes",
      name: "notes",
      mapped: ["@internal/theme", "@internal/tsconfig", "@internal/ui"],
      kept: [],
      catalogued: [],
      differences: [],
    });
    const original = await readTree(join(a, "apps/notes"));
    const copy = await readTree(join(b, "apps/notes"));
    for (const [path, bytes] of original) {
      if (path === "package.json") continue;
      expect(copy.get(path)?.toString(), path).toBe(bytes.toString());
    }
    // The export gave it what it needs to lint and test on its own.
    expect([...copy.keys()].filter((path) => !original.has(path))).toEqual([
      "vitest.config.ts",
    ]);
    expect(await text(b, "pnpm-workspace.yaml")).toBe(before);
  });

  it("turns the versions back into the catalog's", async () => {
    const { a, repo } = await exported();
    const b = await freshInstall("b");

    await importApp(b, repo);

    const original = await json(a, "apps/notes/package.json");
    expect(await json(b, "apps/notes/package.json")).toEqual({
      ...original,
      scripts: {
        ...(original.scripts as object),
        lint: "eslint .",
        test: "vitest run",
      },
      devDependencies: expect.objectContaining({
        ...(original.devDependencies as object),
        eslint: "catalog:",
        vitest: "catalog:",
      }) as unknown,
      robkit: {
        ...(original.robkit as object),
        imported: expect.objectContaining({ from: repo }) as unknown,
      },
    });
  });

  it("adds a version the catalog lacks to it, and takes the catalog's where they differ", async () => {
    const { repo } = await exported();
    await editManifest(join(repo, "package.json"), (manifest) => {
      const deps = manifest.dependencies as Record<string, string>;
      deps["left-pad"] = "1.3.0";
      deps.react = "19.0.0";
    });
    const b = await freshInstall("b");

    const imported = await importApp(b, repo);

    const catalog = (await settings(b)).catalog;
    expect(imported.catalogued).toEqual([["left-pad", "1.3.0"]]);
    expect(imported.differences).toEqual([
      { name: "react", asked: "19.0.0", catalog: catalog.react },
    ]);
    expect(catalog["left-pad"]).toBe("1.3.0");
    expect(await json(b, "apps/notes/package.json")).toMatchObject({
      dependencies: { "left-pad": "catalog:", react: "catalog:" },
    });
  });

  it("keeps shared code that differs from the install's in the app, under the app's name", async () => {
    const { repo } = await exported("start", async (a) => {
      const theme = join(a, "packages/theme/theme.css");
      await writeFile(theme, `${await text(theme)}/* install A's */\n`);
    });
    const b = await freshInstall("b");

    const imported = await importApp(b, repo);

    // The UI kit uses the theme, so it stays with it.
    expect(imported.mapped).toEqual(["@internal/tsconfig"]);
    expect(imported.kept).toEqual([
      ["@internal/theme", "@internal/notes-theme"],
      ["@internal/ui", "@internal/notes-ui"],
    ]);
    const app = join(b, "apps/notes");
    expect(await text(app, "shared/theme/theme.css")).toContain(
      "/* install A's */",
    );
    expect(await json(app, "shared/ui/package.json")).toMatchObject({
      name: "@internal/notes-ui",
      dependencies: {
        "@internal/notes-theme": "workspace:*",
        react: "catalog:",
      },
      devDependencies: { "@internal/tsconfig": "workspace:*" },
    });
    expect(await json(app, "package.json")).toMatchObject({
      dependencies: { "@internal/notes-ui": "workspace:*" },
    });
    expect(await text(app, "src/styles.css")).toBe(
      '@import "@internal/notes-ui/styles.css";\n',
    );
    expect(await text(app, "src/routes/index.tsx")).toContain(
      'from "@internal/notes-ui/components/ui/button"',
    );
    expect(await text(app, "shared/ui/src/styles.css")).toContain(
      '@import "@internal/notes-theme/theme.css";',
    );
    expect((await settings(b)).packages).toContain("apps/*/shared/*");
  });

  it("exports a kept package again as the app's own code", async () => {
    const { repo } = await exported("start", async (a) => {
      const theme = join(a, "packages/theme/theme.css");
      await writeFile(theme, `${await text(theme)}/* install A's */\n`);
    });
    const b = await freshInstall("b");
    await importApp(b, repo);

    const again = await exportApp(b, "notes", {
      out: join(b, "..", "notes-from-b"),
    });

    expect(again.shared).toEqual(["@internal/tsconfig"]);
    expect(await json(again.dir, "shared/theme/package.json")).toMatchObject({
      name: "@internal/notes-theme",
    });
    expect(
      JSON.stringify(await json(again.dir, "shared/ui/package.json")),
    ).not.toContain("catalog:");
  });

  it("leaves out the files the repo holds for itself", async () => {
    const { repo } = await exported();
    const b = await freshInstall("b");

    await importApp(b, repo);

    const paths = [...(await readTree(join(b, "apps/notes"))).keys()];
    for (const path of [
      "pnpm-workspace.yaml",
      "eslint.config.js",
      "README.md",
      ".gitignore",
    ]) {
      expect(paths).not.toContain(path);
    }
    expect(paths.filter((path) => path.startsWith("shared/"))).toEqual([]);
    expect(await json(b, "apps/notes/package.json")).not.toHaveProperty(
      "packageManager",
    );
  });

  it("imports from a git URL", async () => {
    const { repo } = await exported();
    const bare = join(await mkdtemp(join(tmpdir(), "robkit-")), "notes.git");
    await run("git", ["clone", "--quiet", "--bare", repo, bare]);
    const b = await freshInstall("b");

    const imported = await importApp(b, pathToFileURL(bare).href);

    expect(imported.slug).toBe("notes");
    expect(await json(b, "apps/notes/package.json")).toMatchObject({
      name: "@internal/notes-app",
    });
  });

  it("imports under another name with --as", async () => {
    const { repo } = await exported();
    const b = await freshInstall("b");

    const imported = await importApp(b, repo, { as: "jottings" });

    expect(imported.slug).toBe("jottings");
    expect(await json(b, "apps/jottings/package.json")).toMatchObject({
      name: "@internal/jottings-app",
    });
  });

  it.each(readyStacks)("imports an app on the %s stack", async (stack) => {
    const { repo } = await exported(stack);
    const b = await freshInstall("b");

    await importApp(b, repo);

    expect(await json(b, "apps/notes/package.json")).toMatchObject({
      robkit: { stack },
    });
  });

  it("says how to update an app that's already there", async () => {
    const { a, repo } = await exported();

    await expect(importApp(a, repo)).rejects.toThrow(
      "apps/notes already exists. To bring it up to the newest export of where it came from, run pnpm robkit update notes. To add this as another app instead, use --as <name>.",
    );
  });

  it("records where the app came from and which commit it was", async () => {
    const { repo } = await exported();
    const b = await freshInstall("b");
    const { stdout: commit } = await run("git", ["rev-parse", "HEAD"], {
      cwd: repo,
    });

    await importApp(b, repo);

    expect(await json(b, "apps/notes/package.json")).toMatchObject({
      robkit: { imported: { from: repo, commit: commit.trim() } },
    });
  });

  it("records no commit for a folder with uncommitted changes", async () => {
    const { repo } = await exported();
    await writeFile(join(repo, "src/extra.ts"), "export const extra = 1;\n");
    const b = await freshInstall("b");

    await importApp(b, repo);

    expect((await json(b, "apps/notes/package.json")).robkit).toHaveProperty(
      "imported",
      { from: repo },
    );
  });

  it("records the commit when only the repo's own lockfile is uncommitted", async () => {
    const { repo } = await exported();
    await writeFile(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const b = await freshInstall("b");

    await importApp(b, repo);

    expect(await json(b, "apps/notes/package.json")).toMatchObject({
      robkit: { imported: { commit: expect.any(String) as unknown } },
    });
  });

  it("leaves the record of where it came from out of the next export", async () => {
    const { repo } = await exported();
    const b = await freshInstall("b");
    await importApp(b, repo);

    const again = await exportApp(b, "notes", {
      out: join(b, "..", "notes-from-b"),
    });

    expect((await json(again.dir, "package.json")).robkit).not.toHaveProperty(
      "imported",
    );
  });

  it.each(["core", "hub", "admin"])(
    "refuses to import an app as %s",
    async (slug) => {
      const { repo } = await exported();
      const b = await freshInstall("b");

      await expect(importApp(b, repo, { as: slug })).rejects.toThrow(
        `${slug} is one of the platform apps every install has: core, hub and admin. Import it under another name with --as <name>.`,
      );
    },
  );

  it("refuses an app made for a contract version the install can't run", async () => {
    const { repo } = await exported();
    await editManifest(join(repo, "package.json"), (manifest) => {
      (manifest.robkit as { contract: number }).contract = 2;
    });
    const b = await freshInstall("b");

    await expect(importApp(b, repo)).rejects.toThrow(
      "notes was made for robkit contract 2, but this install runs contract 1. Import an export of it made for contract 1, or import it into an install whose robkit runs contract 2.",
    );
  });

  it("refuses a folder that isn't a robkit app", async () => {
    const folder = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(folder, "package.json"), '{ "name": "left-pad" }\n');
    const b = await freshInstall("b");

    await expect(importApp(b, folder)).rejects.toThrow(
      `${folder} names no robkit contract version, so it isn't an app robkit export wrote. Its package.json needs a robkit field with "contract".`,
    );
  });

  it("refuses something that's neither a folder nor a git URL", async () => {
    const b = await freshInstall("b");

    await expect(importApp(b, "nowhere")).rejects.toThrow(
      "There's no folder at nowhere, and it isn't a git URL.",
    );
  });

  it("refuses an app that breaks the layer rule, and writes nothing", async () => {
    const { repo } = await exported();
    await writeFile(
      join(repo, "src/peek.ts"),
      'export const cookie = "robkit_session";\n',
    );
    const b = await freshInstall("b");

    await expect(importApp(b, repo)).rejects.toThrow(
      "notes breaks the layer rule, so it wasn't imported:\napps/notes/src/peek.ts:1:23  Layer rule: handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.",
    );
    expect((await readTree(join(b, "apps"))).has("notes/package.json")).toBe(
      false,
    );
  });
});
