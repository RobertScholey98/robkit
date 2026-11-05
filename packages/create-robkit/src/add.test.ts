import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { addApp, type AppChoices } from "./add.ts";
import { checkInstall } from "./check.ts";
import { defaultChoices, type Choices } from "./choices.ts";
import { init } from "./init.ts";

const run = promisify(execFile);

async function freshInstall(choices: Choices = defaultChoices) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(choices, dir);
  return dir;
}

async function manifest(dir: string, slug: string): Promise<unknown> {
  return JSON.parse(
    await readFile(join(dir, "apps", slug, "package.json"), "utf8"),
  );
}

const notes: AppChoices = {
  stack: "react-hono",
  slug: "notes",
  access: { kind: "open" },
  icon: "📝",
};

describe("addApp", () => {
  it("writes apps/<slug> from the stack's template, with a manifest naming it, its stack, its contract, its rule and icon", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await manifest(dir, "notes")).toMatchObject({
      name: "@internal/notes-app",
      scripts: { migrate: "node src/migrate.ts" },
      dependencies: { "@robkit/hono": "catalog:" },
      robkit: {
        name: "notes",
        stack: "react-hono",
        contract: 1,
        access: { kind: "open" },
        icon: "📝",
      },
    });
    expect(await readFile(join(dir, "apps/notes/src/server.tsx"), "utf8")).toBe(
      await readFile(
        new URL(
          "../templates/stacks/react-hono/src/server.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(await readFile(join(dir, "apps/notes/AGENTS.md"), "utf8")).toContain(
      "A React app on a Hono server in a robkit install.",
    );
    expect(await readFile(join(dir, "apps/notes/CLAUDE.md"), "utf8")).toBe(
      "@AGENTS.md\n",
    );
  });

  it("makes the app its own git repo, which the install ignores and robkit.json records", async () => {
    const dir = await freshInstall();
    await run("git", ["init", "--quiet"], { cwd: dir });

    await addApp(dir, notes);

    const app = join(dir, "apps/notes");
    const inApp = (...args: string[]) =>
      run("git", args, { cwd: app }).then(({ stdout }) => stdout.trim());
    expect(await inApp("rev-parse", "--show-toplevel")).toBe(
      (await realpath(app)).replaceAll("\\", "/"),
    );
    expect(await inApp("log", "--format=%s")).toBe(
      "Add notes on robkit's react-hono stack",
    );
    expect(await inApp("status", "--porcelain")).toBe("");
    expect(await inApp("ls-files", "package.json", ".gitignore")).toBe(
      ".gitignore\npackage.json",
    );
    const { stdout: installStatus } = await run(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "apps"],
      { cwd: dir },
    );
    expect(installStatus).not.toContain("apps/notes");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toMatch(
      /\n\/apps\/notes\/\n$/,
    );
    expect(
      JSON.parse(await readFile(join(dir, "robkit.json"), "utf8")),
    ).toEqual({ exampleStack: "start", apps: { notes: {} } });
  });

  it("makes an app that keeps robkit check's portability rule", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);
    await addApp(dir, { ...notes, slug: "recipes", stack: "start" });

    expect(await checkInstall(dir)).toEqual([]);
  });

  it("names a rule's roles, as core finds them", async () => {
    const dir = await freshInstall();

    await addApp(dir, {
      ...notes,
      access: { kind: "roles", roles: ["Family", "Cooks"] },
    });

    expect(await manifest(dir, "notes")).toMatchObject({
      robkit: { access: { kind: "roles", roles: ["Family", "Cooks"] } },
    });
  });

  it("takes the stack's template from robkit/templates/<stack> when the install has one", async () => {
    const dir = await freshInstall();
    const override = join(dir, "robkit/templates/start");
    await mkdir(join(override, "src"), { recursive: true });
    await writeFile(
      join(override, "package.json"),
      JSON.stringify({ private: true, scripts: { dev: "vite dev" } }),
    );
    await writeFile(join(override, "src/main.ts"), "// my own\n");

    await addApp(dir, { ...notes, stack: "start" });

    expect(await readdir(join(dir, "apps/notes"), { recursive: true })).toEqual(
      expect.arrayContaining(["package.json", join("src", "main.ts")]),
    );
    expect(await readdir(join(dir, "apps/notes/src"))).toEqual(["main.ts"]);
    expect(await manifest(dir, "notes")).toEqual({
      name: "@internal/notes-app",
      private: true,
      scripts: { dev: "vite dev" },
      robkit: {
        name: "notes",
        stack: "start",
        contract: 1,
        access: { kind: "open" },
        icon: "📝",
      },
    });
  });

  it("adds an app on any stack, whatever the example's", async () => {
    const dir = await freshInstall({ exampleStack: "react-hono" });

    await addApp(dir, { ...notes, stack: "start" });

    expect(await manifest(dir, "notes")).toMatchObject({
      dependencies: { "@robkit/start": "catalog:" },
    });
  });

  it.each([
    [
      "my-notes",
      `"my-notes" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    ["hub", "hub is one of the platform apps: core, hub and admin."],
    ["example", "apps/example already exists. Choose another name."],
  ])("refuses the name %j", async (slug, message) => {
    const dir = await freshInstall();

    await expect(addApp(dir, { ...notes, slug })).rejects.toThrow(message);
  });

  it("draws the app with the install's UI kit", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await manifest(dir, "notes")).toMatchObject({
      dependencies: { "@internal/ui": "workspace:*" },
    });
    expect(
      await readFile(join(dir, "apps/notes/src/styles.css"), "utf8"),
    ).toContain('@import "@internal/ui/styles.css";');
    expect(
      await readFile(join(dir, "apps/notes/src/server.tsx"), "utf8"),
    ).toContain('from "@internal/ui/components/ui/card"');
  });

  it("refuses a folder that isn't an install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));

    await expect(addApp(dir, notes)).rejects.toThrow(
      `${dir} has no robkit.json. Run robkit add in an install's folder.`,
    );
  });
});
