import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { vendorPackages } from "./vendor.ts";

async function overridesOf(dir: string): Promise<Record<string, string>> {
  const workspace = parse(
    await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
  ) as { overrides?: Record<string, string> };
  return workspace.overrides ?? {};
}

describe("vendorPackages", () => {
  it("packs each linked package into vendor/robkit and points the install at the tarballs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir, { link: true });
    const linked = Object.keys(await overridesOf(dir));

    await vendorPackages(dir);

    const overrides = await overridesOf(dir);
    expect(Object.keys(overrides)).toEqual(linked);
    for (const [name, spec] of Object.entries(overrides)) {
      const tarball = `vendor/robkit/${name.replace("@", "").replace("/", "-")}-0.0.0.tgz`;
      expect(spec).toBe(`file:${tarball}`);
      await access(join(dir, tarball));
    }
  }, 120_000);

  it("points a bun install's overrides in package.json at the tarballs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init({ ...defaultChoices, packageManager: "bun" }, dir, {
      link: true,
    });

    await vendorPackages(dir);

    const { overrides } = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { overrides: Record<string, string> };
    expect(overrides["@robkit/core"]).toBe(
      "file:vendor/robkit/robkit-core-0.0.0.tgz",
    );
    expect(Object.keys(overrides)).toHaveLength(8);
  }, 120_000);

  it("points a yarn install's resolutions in package.json at the tarballs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init({ ...defaultChoices, packageManager: "yarn" }, dir, {
      link: true,
    });

    await vendorPackages(dir);

    const { resolutions } = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { resolutions: Record<string, string> };
    expect(resolutions["@robkit/core"]).toBe(
      "file:vendor/robkit/robkit-core-0.0.0.tgz",
    );
    expect(Object.keys(resolutions)).toHaveLength(8);
    // The catalog in .yarnrc.yml is left as init wrote it.
    expect(await readFile(join(dir, ".yarnrc.yml"), "utf8")).toContain(
      "catalog:",
    );
  }, 120_000);

  it("refuses an install that isn't linked to a robkit checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir);

    await expect(vendorPackages(dir)).rejects.toThrow(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  });
});
