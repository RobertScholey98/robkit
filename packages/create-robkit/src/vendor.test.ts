import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
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

/** `text` as a pattern that matches it literally. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  describe("when the linked checkout can't be packed", () => {
    /**
     * An install that links `@robkit/broken` to a folder holding a package
     * with `scripts`, or to an empty folder without them.
     */
    async function linkedToBroken(scripts?: Record<string, string>) {
      const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
      await init(defaultChoices, dir);
      const checkout = await mkdtemp(join(tmpdir(), "robkit-checkout-"));
      if (scripts) {
        await writeFile(
          join(checkout, "package.json"),
          JSON.stringify({ name: "@robkit/broken", version: "0.0.0", scripts }),
        );
      }
      const path = join(dir, "pnpm-workspace.yaml");
      await writeFile(
        path,
        `${await readFile(path, "utf8")}overrides:\n  "@robkit/broken": ${JSON.stringify(`link:${checkout}`)}\n`,
      );
      return { dir, checkout };
    }

    it("names the build that failed, its folder and its exit code", async () => {
      const { dir, checkout } = await linkedToBroken({ build: "exit 3" });

      const vendoring = vendorPackages(dir);

      await expect(vendoring).rejects.toThrow(CommandProblem);
      await expect(vendoring).rejects.toThrow(
        `pnpm --recursive --filter @robkit/broken run build exited with 3 in ${checkout}. Its output is above: fix what it says, then try again.`,
      );
    });

    it("names the pack that failed, its folder, its exit code and what it printed", async () => {
      const { dir, checkout } = await linkedToBroken({
        build: "exit 0",
        prepack: "exit 4",
      });

      const vendoring = vendorPackages(dir);

      await expect(vendoring).rejects.toThrow(CommandProblem);
      await expect(vendoring).rejects.toThrow(
        new RegExp(
          `^pnpm --recursive --filter @robkit/broken pack --json --pack-destination ".+" exited with 4 in ${escape(checkout)}\\. It printed:\\n[^]*prepack: \`exit 4\`[^]*\\nFix what it says, then try again\\.$`,
        ),
      );
    });

    it("says which package pnpm didn't pack, and where to look", async () => {
      const { dir, checkout } = await linkedToBroken();

      const vendoring = vendorPackages(dir);

      await expect(vendoring).rejects.toThrow(CommandProblem);
      await expect(vendoring).rejects.toThrow(
        `pnpm pack wrote no tarball for @robkit/broken in ${checkout}. Check that the install's overrides link to a robkit checkout with @robkit/broken in it, then try again.`,
      );
    });

    it("packs a checkout that links one package", async () => {
      const { dir } = await linkedToBroken({ build: "exit 0" });

      await vendorPackages(dir);

      expect(await overridesOf(dir)).toEqual({
        "@robkit/broken": "file:vendor/robkit/robkit-broken-0.0.0.tgz",
      });
    });
  });

  it("refuses an install that isn't linked to a robkit checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir);

    await expect(vendorPackages(dir)).rejects.toThrow(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  });
});
