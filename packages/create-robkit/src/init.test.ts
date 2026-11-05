import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { init } from "./init.ts";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe("init", () => {
  it("writes the install from the choices, leaving install and git to the owner", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "my-app");

    await init({ exampleStack: "react-hono" }, dir);

    expect(
      JSON.parse(await readFile(join(dir, "robkit.json"), "utf8")),
    ).toEqual({ exampleStack: "react-hono" });
    expect(await exists(join(dir, "apps/example/package.json"))).toBe(true);
    expect(await exists(join(dir, "pnpm-lock.yaml"))).toBe(false);
    expect(await exists(join(dir, ".git"))).toBe(false);
  });

  it("gives each install its own Compose project, named after its folder", async () => {
    const folder = async () =>
      join(await mkdtemp(join(tmpdir(), "robkit-")), "My App");
    const [a, b] = [await folder(), await folder()];

    await init({ exampleStack: "start" }, a);
    await init({ exampleStack: "start" }, b);

    const project = async (dir: string) =>
      (
        parse(await readFile(join(dir, "compose.yaml"), "utf8")) as {
          name?: string;
        }
      ).name;
    expect(await project(a)).toMatch(/^my-app-[0-9a-f]{6}$/);
    expect(await project(b)).toMatch(/^my-app-[0-9a-f]{6}$/);
    expect(await project(a)).not.toBe(await project(b));
  });
});
