import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { addApp, type AppChoices } from "./add.ts";
import { shareApp } from "./app-repo.ts";
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

describe("robkit share", { timeout: 60_000 }, () => {
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

  it.each([[["share"], "Usage: robkit share <app>"]])(
    "refuses %j, showing its usage",
    async (args, message) => {
      const a = await freshInstall(await machine(), "install-a");

      const { code, output } = await drive(bin, a, args);

      expect(code).toBe(1);
      expect(output).toContain(message);
    },
  );
});
