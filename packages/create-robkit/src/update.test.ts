import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { addApp } from "./add.ts";
import { defaultChoices } from "./choices.ts";
import { exportApp } from "./export.ts";
import { importApp } from "./import.ts";
import { init } from "./init.ts";
import { updateApp } from "./update.ts";

const run = promisify(execFile);

async function freshInstall(name: string) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), name);
  await init(defaultChoices, dir);
  return dir;
}

const page = "apps/notes/src/routes/index.tsx";

async function text(...path: string[]): Promise<string> {
  return readFile(join(...path), "utf8");
}

/** Replaces `from` with `to` in the file at `path`, once. */
async function edit(path: string, from: string, to: string): Promise<void> {
  const before = await text(path);
  if (!before.includes(from)) throw new Error(`${path} has no ${from}`);
  await writeFile(path, before.replace(from, to));
}

async function head(repo: string): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: repo });
  return stdout.trim();
}

/**
 * Install A's `notes`, exported, and install B with that export imported:
 * R's sharing test up to the update.
 */
async function shared() {
  const a = await freshInstall("a");
  await addApp(a, {
    stack: "start",
    slug: "notes",
    access: { kind: "open" },
    icon: "📝",
  });
  const { dir: repo } = await exportApp(a, "notes");
  const b = await freshInstall("b");
  await importApp(b, repo);
  return { a, b, repo };
}

/** Install A changes its notes' heading and exports again. */
async function aChangesTheHeading(a: string): Promise<void> {
  await edit(
    join(a, page),
    `"Signed in as a guest"`,
    `"Hello from install A. Signed in as a guest"`,
  );
  await exportApp(a, "notes");
}

describe("updateApp", { timeout: 60_000 }, () => {
  it("brings an app nobody edited up to the newest export", async () => {
    const { a, b, repo } = await shared();
    await aChangesTheHeading(a);

    const updated = await updateApp(b, "notes");

    expect(updated).toMatchObject({ slug: "notes", changed: true });
    expect(updated.conflicts).toEqual([]);
    expect(await text(b, page)).toContain(
      `"Hello from install A. Signed in as a guest"`,
    );
    expect(JSON.parse(await text(b, "apps/notes/package.json"))).toMatchObject({
      robkit: { imported: { from: repo, commit: await head(repo) } },
    });
  });

  it("keeps the owner's own edits and adds the export's changes", async () => {
    const { a, b } = await shared();
    await edit(join(b, page), "Visit again", "Count me again");
    await writeFile(join(b, "apps/notes/src/mine.ts"), "export const b = 1;\n");
    await aChangesTheHeading(a);

    const updated = await updateApp(b, "notes");

    expect(updated.conflicts).toEqual([]);
    const merged = await text(b, page);
    expect(merged).toContain(`"Hello from install A. Signed in as a guest"`);
    expect(merged).toContain("Count me again");
    expect(await text(b, "apps/notes/src/mine.ts")).toBe(
      "export const b = 1;\n",
    );
  });

  it("removes a file the export removed, unless the owner changed it", async () => {
    const { a, b } = await shared();
    await rm(join(a, "apps/notes/src/visits.ts"));
    await edit(
      join(a, page),
      `import { recordVisit } from "../visits.ts";\n`,
      "",
    );
    await edit(
      join(a, page),
      "visits: await recordVisit(viewerId),",
      "visits: 0,",
    );
    await exportApp(a, "notes");

    await updateApp(b, "notes");

    await expect(text(b, "apps/notes/src/visits.ts")).rejects.toThrow();
  });

  it("marks where the owner's edits and the export's meet, as git does", async () => {
    const { a, b } = await shared();
    await edit(
      join(b, page),
      `"Signed in as a guest"`,
      `"Install B says hello. Signed in as a guest"`,
    );
    await aChangesTheHeading(a);

    const updated = await updateApp(b, "notes");

    expect(updated.conflicts).toEqual(["src/routes/index.tsx"]);
    expect(await text(b, page)).toContain(`<<<<<<< your apps/notes
      return "Install B says hello. Signed in as a guest";
=======
      return "Hello from install A. Signed in as a guest";
>>>>>>> the new export`);
  });

  it("says when there's nothing new to update to", async () => {
    const { b } = await shared();

    const updated = await updateApp(b, "notes");

    expect(updated).toMatchObject({ changed: false, conflicts: [] });
  });

  it("updates from the git URL it imported from", async () => {
    const { a, repo } = await shared();
    const bare = join(await mkdtemp(join(tmpdir(), "robkit-")), "notes.git");
    await run("git", ["clone", "--quiet", "--bare", repo, bare]);
    const c = await freshInstall("c");
    await importApp(c, pathToFileURL(bare).href);
    await aChangesTheHeading(a);
    await run("git", ["push", "--quiet", bare, "main"], { cwd: repo });

    const updated = await updateApp(c, "notes");

    expect(updated.conflicts).toEqual([]);
    expect(await text(c, page)).toContain(
      `"Hello from install A. Signed in as a guest"`,
    );
  });

  it("refuses an app that robkit import didn't bring in", async () => {
    const { a } = await shared();

    await expect(updateApp(a, "notes")).rejects.toThrow(
      "apps/notes wasn't imported with robkit import, so there's no export to update it from.",
    );
  });

  it("won't guess at the owner's edits without the export it imported, unless forced", async () => {
    const { a, repo } = await shared();
    // A copy outside git: robkit can't find what it imported later.
    const copy = join(await mkdtemp(join(tmpdir(), "robkit-")), "notes");
    await cp(repo, copy, { recursive: true });
    await rm(join(copy, ".git"), { recursive: true });
    const c = await freshInstall("c");
    await importApp(c, copy);
    await edit(join(c, page), "Visit again", "Count me again");
    await aChangesTheHeading(a);
    await cp(join(repo, "src"), join(copy, "src"), { recursive: true });

    await expect(updateApp(c, "notes")).rejects.toThrow(
      `apps/notes came from ${copy}, which wasn't a clean git repository when it was imported, so robkit can't tell your edits from the export's changes. Commit the install, then run pnpm robkit update notes --force to replace apps/notes with the new export. git diff then shows the edits it dropped.`,
    );

    const forced = await updateApp(c, "notes", { force: true });

    expect(forced.changed).toBe(true);
    const replaced = await text(c, page);
    expect(replaced).toContain(`"Hello from install A. Signed in as a guest"`);
    expect(replaced).not.toContain("Count me again");
  });
});
