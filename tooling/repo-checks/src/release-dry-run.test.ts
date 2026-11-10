// The release's dry run, on stand-in packages so it runs anywhere. The
// repo's own packages pass the same checks in published.test.ts, and CI's
// pull-request job runs the dry run on them.
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTarball } from "./publish-list.ts";

let dir: string;

/** A package folder that packs, its manifest changed by `manifest`. */
async function standIn(folder: string, manifest: Record<string, unknown>) {
  const path = join(dir, folder);
  await mkdir(path);
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({
      name: `@robkit/${folder}`,
      version: "0.1.0",
      license: "MIT",
      repository: "git+https://github.com/RobertScholey98/robkit.git",
      type: "module",
      exports: { ".": "./index.js" },
      ...manifest,
    }),
  );
  await writeFile(join(path, "index.js"), "export {};\n");
  await writeFile(join(path, "LICENSE"), "MIT\n");
  return path;
}

function dryRun(...folders: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ["release-dry-run.ts", ...folders],
    { cwd: import.meta.dirname, encoding: "utf8" },
  );
  return { status, stdout, stderr };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-dry-run-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("release-dry-run.ts", { timeout: 120_000 }, () => {
  it("logs each package's version and tarball, and passes sound packages", async () => {
    const { status, stdout, stderr } = dryRun(
      await standIn("one", {}),
      await standIn("two", {}),
    );

    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout).toMatch(
      /^@robkit\/one@0\.1\.0 robkit-one-0\.1\.0\.tgz \d+ B$/m,
    );
    expect(stdout).toMatch(
      /^@robkit\/two@0\.1\.0 robkit-two-0\.1\.0\.tgz \d+ B$/m,
    );
    expect(stdout).toContain(
      "2 packages pack at 0.1.0. Nothing was published.",
    );
  });

  it("fails on packages at two versions, and an export the tarball lacks", async () => {
    const { status, stderr } = dryRun(
      await standIn("one", { exports: { ".": "./gone.js" } }),
      await standIn("two", { version: "0.1.1" }),
    );

    expect(status).toBe(1);
    expect(stderr.trim().split("\n")).toEqual([
      "@robkit/one lacks ./gone.js",
      "The packages aren't at one version: @robkit/one@0.1.0, @robkit/two@0.1.1. Every package is in .changeset/config.json's fixed group, so set them back to one version with pnpm release:version.",
    ]);
  });

  it("writes the tarballs it checked to --out, for the publish job", async () => {
    const out = join(dir, "out");

    const { status, stdout } = dryRun(
      "--out",
      out,
      await standIn("one", {}),
      await standIn("two", {}),
    );

    expect(status).toBe(0);
    expect(stdout).toContain(`Wrote 2 tarballs to ${out}.`);
    expect((await readdir(out)).sort()).toEqual([
      "robkit-one-0.1.0.tgz",
      "robkit-two-0.1.0.tgz",
    ]);
    expect(await readTarball(join(out, "robkit-one-0.1.0.tgz"))).toEqual({
      file: "robkit-one-0.1.0.tgz",
      name: "@robkit/one",
      version: "0.1.0",
    });
  });

  it("writes nothing to --out when a check fails", async () => {
    const out = join(dir, "out");

    const { status } = dryRun(
      "--out",
      out,
      await standIn("one", { exports: { ".": "./gone.js" } }),
    );

    expect(status).toBe(1);
    await expect(readdir(out)).rejects.toThrow("ENOENT");
  });
});
