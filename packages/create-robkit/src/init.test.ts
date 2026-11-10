import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { init } from "./init.ts";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    vi.stubEnv("PATH", await mkdtemp(join(tmpdir(), "no-go-")));

    await expect(init({ exampleStack: "go" }, dir)).rejects.toThrow(
      "Go isn't installed, or isn't on your PATH",
    );
    expect(await exists(dir)).toBe(false);
  });
});
