import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
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

    await init({ ...defaultChoices, generators: ["react-hono"] }, dir);

    expect(
      JSON.parse(await readFile(join(dir, "robkit.json"), "utf8")),
    ).toMatchObject({ generators: ["react-hono"] });
    expect(await exists(join(dir, "apps/example/package.json"))).toBe(true);
    expect(await exists(join(dir, "pnpm-lock.yaml"))).toBe(false);
    expect(await exists(join(dir, ".git"))).toBe(false);
  });
});
