import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { addApp, type AppChoices } from "./add.ts";
import {
  installApp,
  restoreApps,
  shareApp,
  UpdateConflict,
  updateApp,
} from "./app-repo.ts";
import { checkInstall } from "./check.ts";
import { readyStacks, type Stack } from "./choices.ts";
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

const machines: string[] = [];

afterAll(async () => {
  await Promise.all(
    machines.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** A folder for installs that share apps with each other. */
async function machine(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-share-"));
  machines.push(dir);
  return dir;
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
      "apps/example already exists. Install it under another name with --as <name>, or bring in its changes with pnpm robkit update example.",
    ],
    ["core's slug", { as: "core" }, "core is one of the platform apps"],
    ["the hub's slug", { as: "hub" }, "hub is one of the platform apps"],
    [
      "admin's slug",
      { as: "admin" },
      "admin is one of the platform apps: core, hub and admin. Install it under another name with --as <name>.",
    ],
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

describe("updateApp", { timeout: 60_000 }, () => {
  it("brings a later share into the install, keeping its own edit", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    await append(a, "apps/notes/AGENTS.md", "\nA's change.\n");
    await shareApp(a, "notes");
    await append(b, "apps/notes/CLAUDE.md", "\nB's change.\n");

    const updated = await updateApp(b, "notes");

    const app = join(b, "apps/notes");
    expect(updated).toEqual({
      source: shared.source,
      revision: await git(app, "rev-parse", "HEAD"),
      incoming: 1,
    });
    expect(await read(b, "apps/notes/AGENTS.md")).toMatch(/A's change\.\n$/);
    expect(await read(b, "apps/notes/CLAUDE.md")).toMatch(/B's change\.\n$/);
    expect(await git(app, "status", "--porcelain")).toBe("");
    expect(await record(b)).toEqual({
      notes: { source: shared.source, revision: updated.revision },
    });
  });

  it("says when there's nothing new", async () => {
    const { parent, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);

    expect((await updateApp(b, "notes")).incoming).toBe(0);
  });

  it("leaves a clash as a git conflict, and says how to finish it", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    await append(a, "apps/notes/AGENTS.md", "\nA's line.\n");
    await shareApp(a, "notes");
    await append(b, "apps/notes/AGENTS.md", "\nB's line.\n");

    const updating = updateApp(b, "notes");

    await expect(updating).rejects.toBeInstanceOf(UpdateConflict);
    await expect(updating).rejects.toThrow(
      "Git couldn't merge the upstream's changes into apps/notes by itself. These files conflict:\n\n  AGENTS.md\n",
    );
    expect(await read(b, "apps/notes/AGENTS.md")).toContain("<<<<<<<");
    expect(await record(b)).toEqual({
      notes: { source: shared.source, revision: shared.revision },
    });
    // Again before it's resolved: the same advice, nothing new.
    await expect(updateApp(b, "notes")).rejects.toBeInstanceOf(UpdateConflict);
  });

  it("refuses an upstream made for a contract this robkit can't run", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    const manifest = JSON.parse(await read(a, "apps/notes/package.json")) as {
      robkit: object;
    };
    await writeFile(
      join(a, "apps/notes/package.json"),
      JSON.stringify({
        ...manifest,
        robkit: { ...manifest.robkit, contract: 2 },
      }),
    );
    await shareApp(a, "notes");

    await expect(updateApp(b, "notes")).rejects.toThrow(
      "Not updating apps/notes. It was made for robkit contract 2",
    );
    expect(await git(join(b, "apps/notes"), "rev-parse", "HEAD")).toBe(
      shared.revision,
    );
  });

  it("keeps pulling from where the app came from after the install shares it to a repo of its own", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    await append(b, "apps/notes/CLAUDE.md", "\nB's change.\n");
    const own = join(parent, "b-apps", "notes.git");
    await shareApp(b, "notes", { target: own });
    await append(a, "apps/notes/AGENTS.md", "\nA's change.\n");
    await shareApp(a, "notes");

    const updated = await updateApp(b, "notes");

    const app = join(b, "apps/notes");
    expect([updated.source, updated.incoming]).toEqual([shared.source, 1]);
    expect(await read(b, "apps/notes/AGENTS.md")).toMatch(/A's change\.\n$/);
    expect(await git(app, "remote", "get-url", "origin")).toBe(own);
    expect(await record(b)).toEqual({
      notes: {
        source: own,
        upstream: shared.source,
        revision: updated.revision,
      },
    });
    // A's repo never hears of B's change.
    expect(
      await git(shared.source, "log", "--format=%s", "main"),
    ).not.toContain("Share notes\nShare notes\n");
  });

  it("refuses an app that was never shared", async () => {
    const a = await freshInstall(await machine(), "install-a");
    await addApp(a, notes());

    await expect(updateApp(a, "notes")).rejects.toThrow(
      "apps/notes has no upstream: it was never shared or installed. Share it first with pnpm robkit share notes.",
    );
  });
});

describe("restoreApps", { timeout: 60_000 }, () => {
  /** A clone of install A's repository, as a deploy or a new machine gets. */
  async function cloneOf(parent: string, a: string): Promise<string> {
    await git(a, "add", "--all");
    await git(a, "commit", "--quiet", "--message", "Record the apps");
    const clone = join(parent, "install-a-clone");
    await git(parent, "clone", "--quiet", a, clone);
    return clone;
  }

  it("clones each app repo the install's clone lacks, at the commit robkit.json records", async () => {
    const { parent, a, shared } = await sharedFromA();
    const clone = await cloneOf(parent, a);
    // A later push the install hasn't recorded.
    await append(a, "apps/notes/AGENTS.md", "\nUnrecorded.\n");
    await git(
      join(a, "apps/notes"),
      "commit",
      "--quiet",
      "--all",
      "-m",
      "Later",
    );
    await git(join(a, "apps/notes"), "push", "--quiet");
    expect(existsSync(join(clone, "apps/notes"))).toBe(false);

    const restored = await restoreApps(clone);

    const app = join(clone, "apps/notes");
    expect(restored).toEqual({ restored: ["notes"], unshared: [] });
    expect(await git(app, "rev-parse", "HEAD")).toBe(shared.revision);
    expect(await git(app, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(await git(app, "remote", "get-url", "origin")).toBe(shared.source);
    expect(await restoreApps(clone)).toEqual({ restored: [], unshared: [] });
  });

  it("gives an app its upstream again, when it has one apart from its source", async () => {
    const { parent, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    const own = join(parent, "b-apps", "notes.git");
    await shareApp(b, "notes", { target: own });
    const clone = await cloneOf(parent, b);

    await restoreApps(clone);

    const app = join(clone, "apps/notes");
    expect(await git(app, "remote", "get-url", "origin")).toBe(own);
    expect(await git(app, "remote", "get-url", "upstream")).toBe(shared.source);
  });

  it("names an app that was never shared, which it can't fetch", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    const clone = await cloneOf(parent, a);

    expect(await restoreApps(clone)).toEqual({
      restored: [],
      unshared: ["notes"],
    });
  });

  it("is what robkit install does with no argument", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    await addApp(a, notes());
    await shareApp(a, "notes");
    await addApp(a, { ...notes(), slug: "drafts" });
    const clone = await cloneOf(parent, a);

    const { code, output } = await drive(bin, clone, ["install"]);

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "Restored apps/notes.\napps/drafts was never shared, so this install can't fetch it. Share it from the install that made it with pnpm robkit share drafts <git URL>, then commit that install's robkit.json.\n",
    });
  });
});

describe.each(readyStacks)(
  "an app on the %s stack",
  { timeout: 60_000 },
  (stack) => {
    it("shares, installs and updates", async () => {
      const { parent, a, shared } = await sharedFromA(stack);
      const b = await freshInstall(parent, "install-b");
      await installApp(b, shared.source);
      await append(a, "apps/notes/package.json", "");
      await append(a, "apps/notes/AGENTS.md", "\nLater.\n");
      await shareApp(a, "notes");

      await updateApp(b, "notes");

      expect(await read(b, "apps/notes/AGENTS.md")).toBe(
        await read(a, "apps/notes/AGENTS.md"),
      );
      expect(
        (
          JSON.parse(await read(b, "apps/notes/package.json")) as {
            robkit: { stack: string };
          }
        ).robkit.stack,
      ).toBe(stack);
    });
  },
);

describe("robkit share, install and update", { timeout: 60_000 }, () => {
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

  it("update says what came in, or that nothing did", async () => {
    const { parent, a, shared } = await sharedFromA();
    const b = await freshInstall(parent, "install-b");
    await installApp(b, shared.source);
    await append(a, "apps/notes/AGENTS.md", "\nLater.\n");
    await shareApp(a, "notes");

    const updated = await drive(bin, b, ["update", "notes"]);
    const again = await drive(bin, b, ["update", "notes"]);

    expect(updated).toEqual({
      code: 0,
      output: `Brought 1 commit into apps/notes from ${shared.source}.

Restart pnpm dev to migrate the app's database and serve the new version.
`,
    });
    expect(again).toEqual({
      code: 0,
      output: `apps/notes already has everything ${shared.source} has.\n`,
    });
  });

  it("commit what they change in the install's own repo, as add does", async () => {
    const parent = await machine();
    const a = await freshInstall(parent, "install-a");
    const b = await freshInstall(parent, "install-b");
    const source = join(parent, "robkit-apps", "notes.git");

    await drive(bin, a, ["add", "notes", "--stack", "react-hono"]);
    await drive(bin, a, ["share", "notes"]);
    await drive(bin, b, ["install", source]);
    await append(a, "apps/notes/AGENTS.md", "\nLater.\n");
    await drive(bin, a, ["share", "notes"]);
    await drive(bin, b, ["update", "notes"]);

    expect(await git(a, "log", "--format=%s")).toBe(
      "Share notes\nShare notes\nAdd notes\nInit",
    );
    expect(await git(b, "log", "--format=%s")).toBe(
      "Update notes\nInstall notes\nInit",
    );
    expect(await git(a, "status", "--porcelain")).toBe("");
    expect(await git(b, "status", "--porcelain")).toBe("");
    expect(await git(b, "show", "HEAD:robkit.json")).toBe(
      (await read(b, "robkit.json")).trim(),
    );
  });

  it("leave robkit.json to the owner when other changes are staged", async () => {
    const a = await freshInstall(await machine(), "install-a");
    await addApp(a, notes());
    await writeFile(join(a, "plans.md"), "Mine.\n");
    await git(a, "add", "plans.md");

    const { code, output } = await drive(bin, a, ["share", "notes"]);

    expect(code).toBe(0);
    expect(output).toContain(
      "\nThe install has other changes staged, so robkit left robkit.json, .gitignore and pnpm-lock.yaml for you to commit with them.\n",
    );
    expect(await git(a, "log", "--format=%s")).toBe("Init");
  });

  it("commit nothing in an install with no commits yet", async () => {
    const dir = join(await machine(), "install-a");
    await init({ exampleStack: "start" }, dir);
    await git(dir, "init", "--quiet");

    const { code, output } = await drive(bin, dir, [
      "add",
      "notes",
      "--stack",
      "react-hono",
    ]);

    expect({ code, output }).toEqual({
      code: 0,
      output: expect.stringMatching(/^Added apps\/notes\. Next:/) as string,
    });
    expect(await git(dir, "status", "--porcelain")).toContain("?? robkit.json");
  });

  it.each([
    [["share"], "Usage: robkit share <app>"],
    [["install", "one", "two"], "Usage: robkit install <git URL or path>"],
    [["update"], "Usage: robkit update <app>"],
  ])("refuses %j, showing its usage", async (args, message) => {
    const a = await freshInstall(await machine(), "install-a");

    const { code, output } = await drive(bin, a, args);

    expect(code).toBe(1);
    expect(output).toContain(message);
  });
});
