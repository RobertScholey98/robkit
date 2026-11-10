import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carry, readCarried, readRobkitRepo } from "./robkit-repo.ts";

const checkout = fileURLToPath(new URL("../../../", import.meta.url));

/** What create-robkit's build writes, read back as the generator would. */
async function carried() {
  const file = join(await mkdtemp(join(tmpdir(), "robkit-carry-")), "c.json");
  await carry(file);
  return readCarried(file);
}

describe("what create-robkit carries", () => {
  it("is what the checkout holds, with nothing to link to", async () => {
    const fromCheckout = await readRobkitRepo();

    expect(await carried()).toEqual({ ...fromCheckout, links: new Map() });
  });

  it("names each package in packages/ at its version", async () => {
    const { packages } = await carried();
    const folders = await readdir(join(checkout, "packages"));

    expect(packages.get("@robkit/core")).toEqual({
      version: "0.0.0",
      // An install's manifests don't name it: it arrives behind core.
      dependencies: expect.arrayContaining(["@robkit/provision"]) as unknown,
    });
    expect([...packages.keys()]).toContain("create-robkit");
    expect(packages.size).toBe(folders.length);
  });

  it("holds robkit's Go module, without its tests or its manifest", async () => {
    const { goModule } = await carried();
    const paths = [...goModule.keys()];

    expect(paths).toEqual(
      expect.arrayContaining(["go.mod", "session/guarded.go"]),
    );
    expect(paths.filter((path) => path.endsWith("_test.go"))).toEqual([]);
    expect(paths).not.toContain("package.json");
    expect(goModule.get("go.mod")).toBe(
      (await readFile(join(checkout, "go/go.mod"), "utf8")).replaceAll(
        "\r\n",
        "\n",
      ),
    );
  });

  it("holds the lint policy and the files it imports", async () => {
    const { lintPolicy } = await carried();

    expect([...lintPolicy.keys()]).toContain("policy.js");
  });
});

describe("readRobkitRepo", () => {
  it("links each package to its folder in the checkout with link", async () => {
    const { links, packages } = await readRobkitRepo({ link: true });

    expect(links.get("@robkit/core")).toBe(join(checkout, "packages", "core"));
    expect(links.get("create-robkit")).toBe(
      join(checkout, "packages", "create-robkit"),
    );
    expect(links.size).toBe(packages.size);
  });

  it("links nothing without it", async () => {
    expect((await readRobkitRepo()).links).toEqual(new Map());
  });
});

describe("create-robkit#build in turbo.json", () => {
  it("takes in each file create-robkit carries, so a cached build is never stale", async () => {
    const turbo: unknown = JSON.parse(
      await readFile(join(checkout, "turbo.json"), "utf8"),
    );
    const inputs =
      (turbo as { tasks: Record<string, { inputs?: string[] }> }).tasks[
        "create-robkit#build"
      ]?.inputs ?? [];
    const { lintPolicy, goModule } = await readRobkitRepo();
    const read = [
      "pnpm-workspace.yaml",
      "package.json",
      "packages/core/package.json",
      "packages/create-robkit/package.json",
      ...[...lintPolicy.keys()].map((name) => `tooling/eslint/${name}`),
      ...[...goModule.keys()].map((path) => `go/${path}`),
    ];

    const missed = read.filter(
      (path) =>
        !inputs.some((input) =>
          matchesGlob(path, input.replace("$TURBO_ROOT$/", "")),
        ),
    );

    expect(inputs).toContain("$TURBO_DEFAULT$");
    expect(missed).toEqual([]);
  });
});
