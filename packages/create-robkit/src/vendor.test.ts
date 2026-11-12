import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices, type Choices } from "./choices.ts";
import { init } from "./init.ts";
import { installDependencies } from "./set-up.ts";
import { vendorPackages } from "./vendor.ts";

const run = promisify(execFile);

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

describe("vendorPackages", () => {
  it("refuses a linked override that isn't a package name, running nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir, { install: false });
    await override(dir, "x; echo hi", "link:../x");

    await expect(vendorPackages(dir)).rejects.toThrow(
      `"x; echo hi" in pnpm-workspace.yaml's overrides isn't a package name. Fix it, or make the install again with --link.`,
    );
  });

  // Each writes an install, then runs pnpm's build and pack in a checkout,
  // beside the others. That takes 12 to 20 seconds on a CI runner and
  // passed 30 on a busy one.
  describe(
    "when the linked checkout can't be packed",
    { timeout: 120_000 },
    () => {
      /**
       * An install that links `@robkit/broken` to a checkout's
       * `packages/broken` holding a package with `scripts`, or an empty folder
       * without them. The checkout has a Go module in `go/`.
       */
      async function linkedToBroken(
        scripts?: Record<string, string>,
        choices: Choices = defaultChoices,
        { withGo = true, folder = "robkit-vendor-" } = {},
      ) {
        const dir = await mkdtemp(join(tmpdir(), folder));
        await init(choices, dir, { install: false });
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
            JSON.stringify({
              name: "@robkit/broken",
              version: "0.0.0",
              scripts,
            }),
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

      it("names the pack that failed, its folder and its exit code", async () => {
        const { dir, checkout } = await linkedToBroken({
          build: "exit 0",
          prepack: "exit 4",
        });

        const vendoring = vendorPackages(dir);

        await expect(vendoring).rejects.toThrow(CommandProblem);
        await expect(vendoring).rejects.toThrow(
          `pnpm --recursive --filter-prod @robkit/broken... pack --pack-destination ${join(dir, "vendor/robkit")} exited with 4 in ${checkout}. Its output is above: fix what it says, then try again.`,
        );
      });

      it("packs into an install whose folder has a space and a $ in its name", async () => {
        const { dir } = await linkedToBroken(
          { build: "exit 0" },
          defaultChoices,
          {
            folder: "robkit vendor $HOME-",
          },
        );

        await vendorPackages(dir);

        expect(await overridesOf(dir)).toEqual({
          "@robkit/broken": "file:vendor/robkit/robkit-broken-0.0.0.tgz",
          "styled-jsx>@babel/core": "-",
        });
        await access(join(dir, "vendor/robkit/robkit-broken-0.0.0.tgz"));
      });

      it("runs again cleanly after it couldn't copy the Go module", async () => {
        const { dir, root } = await linkedToBroken(
          { build: "exit 0" },
          { exampleStack: "go" },
          { withGo: false },
        );
        await expect(vendorPackages(dir)).rejects.toThrow(
          "can't copy robkit's Go module",
        );
        for (const [path, text] of Object.entries(goModule)) {
          await mkdir(join(root, "go", path, ".."), { recursive: true });
          await writeFile(join(root, "go", path), text);
        }

        await vendorPackages(dir);

        expect(await overridesOf(dir)).toEqual({
          "@robkit/broken": "file:vendor/robkit/robkit-broken-0.0.0.tgz",
          "styled-jsx>@babel/core": "-",
        });
        await access(join(dir, "vendor/robkit/go/guard/guard.go"));
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

      it("copies no Go module into an install with no Go app, and removes one an earlier run left", async () => {
        const { dir } = await linkedToBroken({ build: "exit 0" });
        const left = join(dir, "vendor/robkit/go/guard/guard.go");
        await mkdir(join(left, ".."), { recursive: true });
        await writeFile(left, "package guard\n");

        await vendorPackages(dir);

        expect(await readdir(join(dir, "vendor/robkit"))).toEqual([
          "robkit-broken-0.0.0.tgz",
        ]);
      });

      it("packs for an install with no Go app from a checkout with no Go module", async () => {
        const { dir } = await linkedToBroken(
          { build: "exit 0" },
          defaultChoices,
          { withGo: false },
        );

        await vendorPackages(dir);

        expect(await readdir(join(dir, "vendor/robkit"))).toEqual([
          "robkit-broken-0.0.0.tgz",
        ]);
      });

      /** Makes the checkout at `root` a workspace, and gives its package `code`. */
      async function withCode(root: string, code: string, version = "0.0.0") {
        await writeFile(
          join(root, "pnpm-workspace.yaml"),
          "packages:\n  - packages/*\n",
        );
        const checkout = join(root, "packages", "broken");
        await writeFile(
          join(checkout, "package.json"),
          JSON.stringify({
            name: "@robkit/broken",
            version,
            main: "index.js",
            scripts: { build: "exit 0" },
          }),
        );
        await writeFile(
          join(checkout, "index.js"),
          `module.exports = ${JSON.stringify(code)};\n`,
        );
      }

      /** `file` of the package in `tarball`, as pnpm packed it. */
      async function packedFile(tarball: string, file: string) {
        const { stdout } = await run("tar", [
          "-xOf",
          tarball,
          `package/${file}`,
        ]);
        return stdout;
      }

      it("packs again from the checkout --from names, in an install with no link left", async () => {
        const { dir, root } = await linkedToBroken({ build: "exit 0" });
        await withCode(root, "one");
        await vendorPackages(dir);
        await withCode(root, "two");

        await vendorPackages(dir, { from: root });

        expect(await overridesOf(dir)).toEqual({
          "@robkit/broken": "file:vendor/robkit/robkit-broken-0.0.0.tgz",
          "styled-jsx>@babel/core": "-",
        });
        expect(
          await packedFile(
            join(dir, "vendor/robkit/robkit-broken-0.0.0.tgz"),
            "index.js",
          ),
        ).toBe('module.exports = "two";\n');
      });

      it("takes --from as a path from the install's folder", async () => {
        const { dir, root } = await linkedToBroken({ build: "exit 0" });
        await withCode(root, "one");
        await vendorPackages(dir);
        await withCode(root, "two");

        await vendorPackages(dir, { from: relative(dir, root) });

        expect(
          await packedFile(
            join(dir, "vendor/robkit/robkit-broken-0.0.0.tgz"),
            "index.js",
          ),
        ).toBe('module.exports = "two";\n');
      });

      it("puts the checkout's new code in node_modules though its version didn't change, and a frozen install passes after", async () => {
        const { root, checkout } = await linkedToBroken({ build: "exit 0" });
        await withCode(root, "one");
        // An install small enough to install with no registry: one app that
        // runs on the linked package.
        const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
        await mkdir(join(dir, "apps", "notes"), { recursive: true });
        await writeFile(
          join(dir, "robkit.json"),
          '{ "exampleStack": "start" }',
        );
        await writeFile(join(dir, "package.json"), '{ "private": true }');
        await writeFile(
          join(dir, "pnpm-workspace.yaml"),
          `packages:\n  - apps/*\ncatalog:\n  "@robkit/broken": 0.0.0\noverrides:\n  "@robkit/broken": ${JSON.stringify(`link:${checkout}`)}\n`,
        );
        await writeFile(
          join(dir, "apps", "notes", "package.json"),
          '{ "name": "notes", "dependencies": { "@robkit/broken": "catalog:" } }',
        );
        const installed = () =>
          readFile(
            join(dir, "apps/notes/node_modules/@robkit/broken/index.js"),
            "utf8",
          );
        await vendorPackages(dir);
        await installDependencies(dir);
        expect(await installed()).toBe('module.exports = "one";\n');
        await withCode(root, "two");

        await vendorPackages(dir, { from: root });
        await installDependencies(dir);

        expect(await installed()).toBe('module.exports = "two";\n');
        await run("pnpm", ["install", "--frozen-lockfile"], { cwd: dir });
      });

      it("says how to pack again when the install has vendored and --from is missing", async () => {
        const { dir } = await linkedToBroken({ build: "exit 0" });
        await vendorPackages(dir);

        await expect(vendorPackages(dir)).rejects.toThrow(
          "This install runs the tarballs robkit vendor packed, and links to no robkit checkout. To pack them again from a checkout, run pnpm robkit vendor --from <checkout>.",
        );
      });

      it("refuses a --from folder that isn't a robkit checkout, changing nothing", async () => {
        const { dir } = await linkedToBroken({ build: "exit 0" });
        const before = await overridesOf(dir);
        const elsewhere = await mkdtemp(join(tmpdir(), "robkit-elsewhere-"));

        await expect(vendorPackages(dir, { from: elsewhere })).rejects.toThrow(
          `${elsewhere} has no packages folder, so it isn't a robkit checkout. Give --from the folder robkit is cloned into.`,
        );

        expect(await overridesOf(dir)).toEqual(before);
      });

      it("says when the checkout has no Go module to copy", async () => {
        const { dir, root } = await linkedToBroken(
          { build: "exit 0" },
          { exampleStack: "go" },
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
        expect(copied.map((path) => path.replaceAll("\\", "/")).sort()).toEqual(
          ["README.md", "go.mod", "guard", "guard/guard.go"],
        );
        expect(
          (await readFile(goMod, "utf8"))
            .split("\n")
            .filter((line) => line.startsWith("replace ")),
        ).toEqual([
          "replace github.com/RobertScholey98/robkit/go => ../../vendor/robkit/go",
        ]);
      });
    },
  );

  it("refuses an install that isn't linked to a robkit checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir, { install: false });

    await expect(vendorPackages(dir)).rejects.toThrow(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  });
});
