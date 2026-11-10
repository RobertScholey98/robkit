import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices, type Choices } from "./choices.ts";
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

/** A checkout's Go module, by path, with a test and a manifest to leave out. */
const goModule = {
  "go.mod": "module github.com/RobertScholey98/robkit/go\n",
  "README.md": "# The Go module\n",
  "package.json": '{ "name": "@internal/go" }\n',
  "guard/guard.go": "package guard\n",
  "guard/guard_test.go": "package guard_test\n",
};

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
     * An install that links `@robkit/broken` to a checkout's
     * `packages/broken` holding a package with `scripts`, or an empty folder
     * without them. The checkout has a Go module in `go/`.
     */
    async function linkedToBroken(
      scripts?: Record<string, string>,
      choices: Choices = defaultChoices,
      { withGo = true } = {},
    ) {
      const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
      await init(choices, dir);
      const root = await mkdtemp(join(tmpdir(), "robkit-checkout-"));
      const checkout = join(root, "packages", "broken");
      await mkdir(checkout, { recursive: true });
      for (const [path, text] of Object.entries(withGo ? goModule : {})) {
        await mkdir(join(root, "go", path, ".."), { recursive: true });
        await writeFile(join(root, "go", path), text);
      }
      if (scripts) {
        await writeFile(
          join(checkout, "package.json"),
          JSON.stringify({ name: "@robkit/broken", version: "0.0.0", scripts }),
        );
      }
      await override(dir, "@robkit/broken", `link:${checkout}`);
      return { dir, root, checkout };
    }

    it("names the build that failed, its folder and its exit code", async () => {
      const { dir, checkout } = await linkedToBroken({ build: "exit 3" });

      const vendoring = vendorPackages(dir);

      await expect(vendoring).rejects.toThrow(CommandProblem);
      await expect(vendoring).rejects.toThrow(
        `pnpm --recursive --filter-prod @robkit/broken... run build exited with 3 in ${checkout}. Its output is above: fix what it says, then try again.`,
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
          `^pnpm --recursive --filter-prod @robkit/broken\\.\\.\\. pack --json --pack-destination ".+" exited with 4 in ${escape(checkout)}\\. It printed:\\n[^]*prepack: \`exit 4\`[^]*\\nFix what it says, then try again\\.$`,
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

    it("packs what a linked package runs on, though the install doesn't link it", async () => {
      const { dir, root, checkout } = await linkedToBroken();
      // The checkout is a workspace: broken runs on helper, and builds
      // with tooling, which stays out.
      await writeFile(
        join(root, "pnpm-workspace.yaml"),
        "packages:\n  - packages/*\n",
      );
      const manifest = (name: string, more: object = {}) =>
        JSON.stringify({
          name,
          version: "0.0.0",
          scripts: { build: "exit 0" },
          ...more,
        });
      await writeFile(
        join(checkout, "package.json"),
        manifest("@robkit/broken", {
          dependencies: { "@robkit/helper": "workspace:*" },
          devDependencies: { "@robkit/tooling": "workspace:*" },
        }),
      );
      for (const name of ["helper", "tooling"]) {
        await mkdir(join(root, "packages", name));
        await writeFile(
          join(root, "packages", name, "package.json"),
          manifest(`@robkit/${name}`),
        );
      }

      await vendorPackages(dir);

      expect(await overridesOf(dir)).toEqual({
        "@robkit/broken": "file:vendor/robkit/robkit-broken-0.0.0.tgz",
        "@robkit/helper": "file:vendor/robkit/robkit-helper-0.0.0.tgz",
        "styled-jsx>@babel/core": "-",
      });
    });

    it("says when the checkout has no Go module to copy", async () => {
      const { dir, root } = await linkedToBroken(
        { build: "exit 0" },
        defaultChoices,
        { withGo: false },
      );

      await expect(vendorPackages(dir)).rejects.toThrow(
        `${join(root, "packages", "broken", "..", "..", "go")} doesn't exist, so robkit vendor can't copy robkit's Go module from the checkout. Check that the install's overrides link to a robkit checkout, then try again.`,
      );
    });

    it("copies the checkout's Go module, but its tests, and points each Go app at the copy", async () => {
      const { dir, root } = await linkedToBroken(
        { build: "exit 0" },
        { exampleStack: "go" },
      );
      const goMod = join(dir, "apps/example/go.mod");
      const linkedGoMod = (await readFile(goMod, "utf8")).replace(
        "=> ../../vendor/robkit/go",
        `=> ${join(root, "go").replaceAll("\\", "/")}`,
      );
      await writeFile(goMod, linkedGoMod);

      await vendorPackages(dir);

      const copied = await readdir(join(dir, "vendor/robkit/go"), {
        recursive: true,
      });
      expect(copied.map((path) => path.replaceAll("\\", "/")).sort()).toEqual([
        "README.md",
        "go.mod",
        "guard",
        "guard/guard.go",
      ]);
      expect(
        (await readFile(goMod, "utf8"))
          .split("\n")
          .filter((line) => line.startsWith("replace ")),
      ).toEqual([
        "replace github.com/RobertScholey98/robkit/go => ../../vendor/robkit/go",
      ]);
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
