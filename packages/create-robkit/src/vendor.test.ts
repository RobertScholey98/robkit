import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("refuses a linked override that isn't a package name, running nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir);
    const path = join(dir, "pnpm-workspace.yaml");
    await writeFile(
      path,
      `${await readFile(path, "utf8")}overrides:\n  "x; echo hi": "link:../x"\n`,
    );

    await expect(vendorPackages(dir)).rejects.toThrow(
      `"x; echo hi" in pnpm-workspace.yaml's overrides isn't a package name. Fix it, or make the install again with --link.`,
    );
  });

  it("refuses an install that isn't linked to a robkit checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir);

    await expect(vendorPackages(dir)).rejects.toThrow(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  });
});
