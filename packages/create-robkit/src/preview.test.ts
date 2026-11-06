import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { generateInstall } from "./generate.ts";
import { syncPreview, type PreviewSetUp } from "./preview.ts";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** A set-up that records what it was asked to do, and does nothing. */
function recordingSetUp(): PreviewSetUp & { steps: string[] } {
  const steps: string[] = [];
  return {
    steps,
    initGit: (dir) => {
      steps.push(`git ${dir}`);
      return Promise.resolve();
    },
    installDependencies: (dir) => {
      steps.push(`install ${dir}`);
      return Promise.resolve();
    },
  };
}

/** A preview made in a new folder, and what making it did. */
async function madePreview(): Promise<{ dir: string }> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "preview");
  await syncPreview(dir, { setUp: recordingSetUp() });
  return { dir };
}

describe("syncPreview", () => {
  it("makes a linked install in a new folder, then sets up git and installs", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "preview");
    const setUp = recordingSetUp();

    const sync = await syncPreview(dir, { stack: "react-hono", setUp });

    expect(sync.outcome).toBe("made");
    expect(setUp.steps).toEqual([`git ${dir}`, `install ${dir}`]);
    const expected = await generateInstall(
      { exampleStack: "react-hono" },
      { link: true },
    );
    for (const [path, text] of expected) {
      expect(await readFile(join(dir, path), "utf8"), path).toBe(text);
    }
  });

  it("changes nothing and installs nothing when the templates haven't changed", async () => {
    const { dir } = await madePreview();
    const setUp = recordingSetUp();

    const sync = await syncPreview(dir, { setUp });

    expect(sync).toEqual({
      outcome: "updated",
      written: [],
      removed: [],
      installed: false,
    });
    expect(setUp.steps).toEqual([]);
  });

  it("writes a file whose template differs, without installing", async () => {
    const { dir } = await madePreview();
    const launcher = "apps/hub/src/launcher.tsx";
    const template = await readFile(join(dir, launcher), "utf8");
    await writeFile(join(dir, launcher), "// an older launcher\n");
    const setUp = recordingSetUp();

    const sync = await syncPreview(dir, { setUp });

    expect(sync).toEqual({
      outcome: "updated",
      written: [launcher],
      removed: [],
      installed: false,
    });
    expect(await readFile(join(dir, launcher), "utf8")).toBe(template);
    expect(setUp.steps).toEqual([]);
  });

  it("installs again when a manifest or pnpm's settings change", async () => {
    const { dir } = await madePreview();
    await writeFile(join(dir, "apps/hub/package.json"), "{}\n");
    await writeFile(join(dir, "pnpm-workspace.yaml"), "packages: []\n");
    const setUp = recordingSetUp();

    const sync = await syncPreview(dir, { setUp });

    expect(sync).toEqual({
      outcome: "updated",
      written: ["apps/hub/package.json", "pnpm-workspace.yaml"],
      removed: [],
      installed: true,
    });
    expect(setUp.steps).toEqual([`install ${dir}`]);
  });

  it("removes a file the templates no longer have", async () => {
    const { dir } = await madePreview();
    const record = join(dir, ".robkit-preview.json");
    const { files } = JSON.parse(await readFile(record, "utf8")) as {
      files: string[];
    };
    await writeFile(join(dir, "apps/hub/src/gone.ts"), "export {};\n");
    await writeFile(
      record,
      JSON.stringify({ files: [...files, "apps/hub/src/gone.ts"] }),
    );

    const sync = await syncPreview(dir, { setUp: recordingSetUp() });

    expect(sync).toMatchObject({ removed: ["apps/hub/src/gone.ts"] });
    expect(await exists(join(dir, "apps/hub/src/gone.ts"))).toBe(false);
  });

  it("leaves files the templates never had, such as the lockfile", async () => {
    const { dir } = await madePreview();
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    await syncPreview(dir, { setUp: recordingSetUp() });

    expect(await exists(join(dir, "pnpm-lock.yaml"))).toBe(true);
  });

  it("refuses a folder in use that it didn't make", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(dir, "notes.txt"), "mine\n");

    const syncing = syncPreview(dir, { setUp: recordingSetUp() });

    await expect(syncing).rejects.toThrow(CommandProblem);
    await expect(syncing).rejects.toThrow(
      `${dir} has files, and no .robkit-preview.json to say pnpm preview-install made it. Choose an empty folder, or the one it made before.`,
    );
  });

  it("refuses another stack for a preview it made before", async () => {
    const { dir } = await madePreview();

    await expect(
      syncPreview(dir, { stack: "react-hono", setUp: recordingSetUp() }),
    ).rejects.toThrow(
      `${dir} is a preview of the start stack. Leave out --stack, or remove the folder to make it again on react-hono.`,
    );
  });

  it("refuses a record it can't read, naming it", async () => {
    const { dir } = await madePreview();
    await writeFile(join(dir, ".robkit-preview.json"), "{ nope");

    await expect(syncPreview(dir, { setUp: recordingSetUp() })).rejects.toThrow(
      `${join(dir, ".robkit-preview.json")} isn't a list of the files pnpm preview-install wrote. Remove the folder, and pnpm preview-install makes it again.`,
    );
  });
});
