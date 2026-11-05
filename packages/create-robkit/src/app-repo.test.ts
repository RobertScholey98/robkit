import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { addApp, type AppChoices } from "./add.ts";
import { installApp, shareApp } from "./app-repo.ts";
import { checkInstall } from "./check.ts";
import type { Stack } from "./choices.ts";
import { init } from "./init.ts";
import { drive } from "./test/drive.ts";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("robkit.ts", import.meta.url));

/** git in `dir`, with an author, printing what it says, trimmed. */
async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run(
    "git",
    ["-c", "user.name=R", "-c", "user.email=r@example.com", ...args],
    { cwd: dir },
  );
  return stdout.trim();
}

/** A folder for installs that share apps with each other. */
function machine(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-share-"));
}

/** A written install in `parent`, a git repo, without its dependencies. */
async function freshInstall(parent: string, name: string): Promise<string> {
  const dir = join(parent, name);
  await init({ exampleStack: "start" }, dir);
  await git(dir, "init", "--quiet");
  await git(dir, "add", "--all");
  await git(dir, "commit", "--quiet", "--message", "Init");
  return dir;
}

const notes = (stack: Stack = "react-hono"): AppChoices => ({
  stack,
  slug: "notes",
  access: { kind: "open" },
  icon: "📝",
});

async function record(dir: string): Promise<unknown> {
  return (
    JSON.parse(await readFile(join(dir, "robkit.json"), "utf8")) as {
      apps?: unknown;
    }
  ).apps;
}

const read = (dir: string, path: string) => readFile(join(dir, path), "utf8");

async function append(dir: string, path: string, text: string) {
  await writeFile(join(dir, path), (await read(dir, path)) + text);
}

/** Install A with app `notes`, shared to the default place. */
async function sharedFromA(stack?: Stack) {
  const parent = await machine();
  const a = await freshInstall(parent, "install-a");
  await addApp(a, notes(stack));
  const shared = await shareApp(a, "notes");
  return { parent, a, shared };
}

describe("shareApp", { timeout: 60_000 }, () => {
  it("commits the app's changes and pushes them to a new bare repo beside the install, its upstream from then on", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    await append(a, "apps/notes/AGENTS.md", "\nShared from A.\n");

    const shared = await shareApp(a, "notes", {
      message: "Say where it's from",
    });

    const upstream = join(parent, "robkit-apps", "notes.git");
    const app = join(a, "apps/notes");
    expect(shared).toEqual({
      source: upstream,
      revision: await git(app, "rev-parse", "HEAD"),
      created: true,
    });
    expect(await git(upstream, "log", "--format=%s", "main")).toBe(
      "Say where it's from\nAdd notes on robkit's react-hono stack",
    );
    expect(await git(app, "status", "--porcelain")).toBe("");
    expect(await git(app, "remote", "get-url", "origin")).toBe(upstream);
    expect(await record(a)).toEqual({
      notes: { source: upstream, revision: shared.revision },
    });
  });

  it("pushes to a path it's given, then to that upstream with none given", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    const elsewhere = join(parent, "mine", "notes.git");

    const first = await shareApp(a, "notes", { target: elsewhere });
    await append(a, "apps/notes/AGENTS.md", "\nAgain.\n");
    const second = await shareApp(a, "notes");

    expect([first.source, first.created]).toEqual([elsewhere, true]);
    expect([second.source, second.created]).toEqual([elsewhere, false]);
    expect(await git(elsewhere, "rev-parse", "main")).toBe(second.revision);
    expect(existsSync(join(parent, "robkit-apps"))).toBe(false);
  });

  it("makes init's example an app repo, which the install stops tracking", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");

    await shareApp(a, "example");

    expect(existsSync(join(a, "apps/example/.git"))).toBe(true);
    expect(await git(a, "ls-files", "apps/example")).toBe("");
    expect(await read(a, ".gitignore")).toContain("\n/apps/example/\n");
    expect(
      await git(join(parent, "robkit-apps/example.git"), "log", "--format=%s"),
    ).toBe("Make example an app repo");
  });

  it("refuses an app that breaks the layer rule, naming each problem", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    await mkdir(join(a, "packages/mylib"));
    await writeFile(
      join(a, "packages/mylib/package.json"),
      JSON.stringify({ name: "@internal/mylib" }),
    );
    await writeFile(
      join(a, "apps/notes/src/mine.ts"),
      'import "@internal/mylib";\n',
    );

    await expect(shareApp(a, "notes")).rejects.toThrow(
      "apps/notes can't be shared until it keeps the layer rule. robkit check found:\n\n  apps/notes/src/mine.ts:1:8  Layer rule: an app is portable.",
    );
    expect(existsSync(join(parent, "robkit-apps"))).toBe(false);
  });

  it("refuses a platform app", async () => {
    const a = await freshInstall(await machine(), "install-a");

    await expect(shareApp(a, "admin")).rejects.toThrow(
      "admin comes with every install, so there's nothing to share.",
    );
  });

  it("refuses to push over a later share, saying to update first", async () => {
    const { parent, a, shared } = await sharedFromA();
    const elsewhere = join(parent, "elsewhere");
    await git(parent, "clone", "--quiet", shared.source, elsewhere);
    await append(elsewhere, "AGENTS.md", "\nFrom elsewhere.\n");
    await git(elsewhere, "commit", "--quiet", "--all", "--message", "Edit");
    await git(elsewhere, "push", "--quiet");
    await append(a, "apps/notes/CLAUDE.md", "\nFrom A.\n");

    await expect(shareApp(a, "notes")).rejects.toThrow(
      `${join(parent, "robkit-apps", "notes.git")} has changes apps/notes doesn't. Bring them in with pnpm robkit update notes, then share again.`,
    );
  });
});

describe("installApp", { timeout: 60_000 }, () => {
  it("clones a shared app into another install as an app repo, recording where it came from", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");

    const installed = await installApp(b, shared.source);

    expect(installed).toEqual({
      slug: "notes",
      name: "notes",
      description: undefined,
      source: shared.source,
      revision: shared.revision,
    });
    const app = join(b, "apps/notes");
    expect(await git(app, "remote", "get-url", "origin")).toBe(shared.source);
    expect(await read(b, "apps/notes/src/server.tsx")).toBe(
      await read(a, "apps/notes/src/server.tsx"),
    );
    expect(await git(b, "status", "--porcelain", "apps")).toBe("");
    expect(await record(b)).toEqual({
      notes: { source: shared.source, revision: shared.revision },
    });
    expect(await checkInstall(b)).toEqual([]);
  });

  it("takes a path relative to where it runs", async () => {
    const { parent } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");

    const installed = await installApp(b, "../robkit-apps/notes.git");

    expect(installed.source).toBe(join(parent, "robkit-apps", "notes.git"));
  });

  it("installs under the name --as gives, naming its package after it", async () => {
    const { parent, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");

    await installApp(b, shared.source, { as: "jottings" });

    const manifest = JSON.parse(
      await read(b, "apps/jottings/package.json"),
    ) as {
      name: string;
      robkit: { name: string };
    };
    expect([manifest.name, manifest.robkit.name]).toEqual([
      "@internal/jottings-app",
      "notes",
    ]);
    expect(
      await git(join(b, "apps/jottings"), "log", "-1", "--format=%s"),
    ).toBe("Install as jottings");
  });

  it.each([
    [
      "a slug that's taken",
      { as: "example" },
      "apps/example already exists. Choose another name. Install it under another name with --as <name>, or bring in its changes with pnpm robkit update example.",
    ],
    ["core's slug", { as: "core" }, "core is one of the platform apps"],
    ["the hub's slug", { as: "hub" }, "hub is one of the platform apps"],
    ["admin's slug", { as: "admin" }, "admin is one of the platform apps"],
    [
      "a slug that isn't one",
      { as: "my-notes" },
      `"my-notes" can't be an app's slug`,
    ],
  ])("refuses %s", async (_, options, message) => {
    const { parent, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");

    await expect(installApp(b, shared.source, options)).rejects.toThrow(
      message,
    );
  });

  /** An app repo outside any install, whose manifest is edited by `edit`. */
  async function repoOutside(
    parent: string,
    edit: (manifest: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<string> {
    const { a } = await sharedFromA();
    const repo = join(parent, "made-elsewhere");
    await git(parent, "clone", "--quiet", join(a, "apps/notes"), repo);
    const manifest = JSON.parse(await read(repo, "package.json")) as Record<
      string,
      unknown
    >;
    await writeFile(join(repo, "package.json"), JSON.stringify(edit(manifest)));
    await git(repo, "commit", "--quiet", "--all", "--message", "Edit");
    return repo;
  }

  it("refuses an app made for a contract this robkit can't run, and leaves nothing behind", async () => {
    const parent = await machine();
    const repo = await repoOutside(parent, (manifest) => ({
      ...manifest,
      robkit: { ...(manifest.robkit as object), contract: 2 },
    }));
    const b = await freshInstall(parent, "install-b");

    await expect(installApp(b, repo, { as: "notes" })).rejects.toThrow(
      `Can't install ${repo}. It was made for robkit contract 2, and this install's robkit runs contract 1. Update robkit in this install, or ask its author for a version made for contract 1.`,
    );
    expect(existsSync(join(b, "apps/notes"))).toBe(false);
    expect(await record(b)).toBeUndefined();
  });

  it("refuses a repo that isn't a robkit app", async () => {
    const parent = await machine();
    const repo = await repoOutside(parent, (manifest) => ({
      ...manifest,
      robkit: undefined,
    }));
    const b = await freshInstall(parent, "install-b");

    await expect(installApp(b, repo, { as: "notes" })).rejects.toThrow(
      `${repo} isn't a robkit app: its package.json has no robkit field.`,
    );
  });

  it("refuses an app that leans on a package outside the contract", async () => {
    const parent = await machine();
    const repo = await repoOutside(parent, (manifest) => ({
      ...manifest,
      dependencies: {
        ...(manifest.dependencies as object),
        "@internal/mylib": "workspace:*",
      },
    }));
    const b = await freshInstall(parent, "install-b");

    await expect(installApp(b, repo, { as: "notes" })).rejects.toThrow(
      "apps/notes can't be installed until it keeps the layer rule.",
    );
    expect(existsSync(join(b, "apps/notes"))).toBe(false);
  });

  it("refuses a path with no repo", async () => {
    const parent = await machine();
    const b = await freshInstall(parent, "install-b");

    await expect(installApp(b, "../nothing.git")).rejects.toThrow(
      `There's no app repo at ${join(parent, "nothing.git")}.`,
    );
  });
});

describe("robkit share and install", { timeout: 60_000 }, () => {
  it("share says where the app went and how another install takes it", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    const upstream = join(parent, "robkit-apps", "notes.git");

    const shared = await drive(bin, a, ["share", "notes"]);

    const revision = await git(join(a, "apps/notes"), "rev-parse", "HEAD");
    expect(shared).toEqual({
      code: 0,
      output: `Shared apps/notes to ${upstream}, a new bare repository, at ${revision.slice(0, 7)}.

Another install takes it with:

  pnpm robkit install ${upstream}

and brings in later shares with pnpm robkit update notes.
`,
    });
  });

  it("install says what it installed and what comes next", async () => {
    const { parent, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");

    const installed = await drive(bin, b, ["install", shared.source]);

    expect(installed).toEqual({
      code: 0,
      output: `Installed notes as apps/notes, from ${shared.source}.

Next:

  pnpm install
  pnpm dev

Then open http://notes.robkit.localhost:3000.
`,
    });
  });

  it.each([
    [["share"], "Usage: robkit share <app>"],
    [["install"], "Usage: robkit install <git URL or path>"],
  ])("refuses %j, showing its usage", async (args, message) => {
    const a = await freshInstall(await machine(), "install-a");

    const { code, output } = await drive(bin, a, args);

    expect(code).toBe(1);
    expect(output).toContain(message);
  });
});
