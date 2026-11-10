import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { pathWith } from "./test/path.ts";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe("init", () => {
  it("writes only the install from the choices when told not to install", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "my-app");

    await init({ exampleStack: "react-hono" }, dir, { install: false });

    expect(
      JSON.parse(await readFile(join(dir, "robkit.json"), "utf8")),
    ).toEqual({ exampleStack: "react-hono" });
    expect(await exists(join(dir, "apps/example/package.json"))).toBe(true);
    expect(await exists(join(dir, "pnpm-lock.yaml"))).toBe(false);
    expect(await exists(join(dir, ".git"))).toBe(false);
  });

  it("says how to install Go, writing nothing, for a React + Go install when go isn't on the PATH", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "my-app");
    const env = await pathWith({});

    await expect(init({ exampleStack: "go" }, dir, { env })).rejects.toThrow(
      "Go isn't installed, or isn't on your PATH",
    );
    expect(await exists(dir)).toBe(false);
  });

  it.each([
    [
      "missing",
      {},
      "pnpm isn't installed, or isn't on your PATH, and init installs with it. Run npm install -g pnpm, then run npm create robkit again.",
    ],
    [
      "too old for the install's packageManager",
      { pnpm: "9.15.9", corepack: "0.34.0" },
      "pnpm 9.15.9 can't run pnpm 11.28.9, which the install uses. Run corepack enable, then run npm create robkit again.",
    ],
  ])(
    "says how to fix pnpm, writing nothing, when it's %s",
    async (_, commands, message) => {
      const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "my-app");
      const env = await pathWith(commands);

      await expect(init(defaultChoices, dir, { env })).rejects.toThrow(message);
      expect(await exists(dir)).toBe(false);
    },
  );
});
