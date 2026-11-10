// The release workflow's publish step refuses to start without the token,
// or before the tarballs match main's packages. publish-list.test.ts covers
// what it decides and how it publishes.
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Each import of `file` and of every file it imports in turn, as
 * `<file>: <specifier>`, that isn't a `node:` module or a relative file.
 */
async function packageImports(file: string, seen = new Set<string>()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const { importedFiles } = ts.preProcessFile(await readFile(file, "utf8"));
  const found: string[] = [];
  for (const { fileName } of importedFiles) {
    if (fileName.startsWith("node:")) continue;
    if (fileName.startsWith("./") || fileName.startsWith("../")) {
      found.push(
        ...(await packageImports(join(dirname(file), fileName), seen)),
      );
      continue;
    }
    found.push(`${relative(import.meta.dirname, file)}: ${fileName}`);
  }
  return found;
}

describe("release-publish.ts", () => {
  it.each([undefined, ""])(
    "stops before it reads npm or publishes anything when NPM_TOKEN is %j",
    (token) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NPM_TOKEN: token };
      if (token === undefined) delete env.NPM_TOKEN;
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        ["release-publish.ts"],
        { cwd: import.meta.dirname, env, encoding: "utf8" },
      );

      expect(status).toBe(1);
      expect(stdout).toBe("");
      expect(stderr.trim()).toBe(
        'NPM_TOKEN is missing, so nothing was published. Add it as a secret of the release environment, as CONTRIBUTING.md\'s "Releasing" says, then run the release again.',
      );
    },
  );

  it("stops without the tarballs' folder", () => {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      ["release-publish.ts"],
      {
        cwd: import.meta.dirname,
        env: { ...process.env, NPM_TOKEN: "t0ken" },
        encoding: "utf8",
      },
    );

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr.trim()).toBe(
      "Name the folder that holds the pack job's tarballs: node tooling/repo-checks/src/release-publish.ts <folder>",
    );
  });

  it("stops before it reads npm when a package has no tarball", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-tarballs-"));
    try {
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        ["release-publish.ts", dir],
        {
          cwd: import.meta.dirname,
          env: { ...process.env, NPM_TOKEN: "t0ken" },
          encoding: "utf8",
        },
      );

      expect(status).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toMatch(
        /^The pack job's artifact has no robkit-core-[\d.]+\.tgz for @robkit\/core@[\d.]+, which main holds\. Run the release again from main\.$/m,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // It runs beside the npm token, so no package's code runs with it.
  it("imports only node: modules and files that do the same", async () => {
    const script = join(import.meta.dirname, "release-publish.ts");

    expect(await packageImports(script)).toEqual([]);
    // The walk finds a package import: release.ts reads YAML.
    expect(
      await packageImports(join(import.meta.dirname, "release.ts")),
    ).toContain("release.ts: yaml");
  });
});
