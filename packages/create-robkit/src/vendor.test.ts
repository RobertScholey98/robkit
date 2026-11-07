import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { vendorPackages } from "./vendor.ts";

async function overridesOf(dir: string): Promise<Record<string, string>> {
  const workspace = parse(
    await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
  ) as { overrides?: Record<string, string> };
  return workspace.overrides ?? {};
}

/** Adds an override to the install in `dir`, beside the template's own. */
async function override(
  dir: string,
  name: string,
  spec: string,
): Promise<void> {
  const path = join(dir, "pnpm-workspace.yaml");
  const workspace = parseDocument(await readFile(path, "utf8"));
  workspace.setIn(["overrides", name], spec);
  await writeFile(path, workspace.toString());
}

/** `text` as a pattern that matches it literally. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("vendorPackages", () => {
  it("refuses a linked override that isn't a package name, running nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir);
    await override(dir, "x; echo hi", "link:../x");

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
      await override(dir, "@robkit/broken", `link:${checkout}`);
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
        "styled-jsx>@babel/core": "-",
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
