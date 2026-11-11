import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-coverage-thresholds.ts");
const guard = "packages/guard/vitest.config.ts";

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

async function write(path: string, text: string) {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), text);
}

const config = (lines: number) =>
  `export default { test: { coverage: { thresholds: { lines: ${String(lines)} } } } };\n`;

function check(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, ...args],
    { cwd: repo, encoding: "utf8" },
  );
  return { status, output: stdout + stderr };
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "coverage-thresholds-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  await write("packages/guard/package.json", "{}\n");
  await write(guard, config(90));
  git("add", "-A");
  git("commit", "-q", "-m", "Start");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("check-coverage-thresholds", () => {
  it("passes when every threshold stays or rises", async () => {
    await write(guard, config(95));

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  it("fails when a threshold goes down", async () => {
    await write(guard, config(85));

    expect(check("main")).toEqual({
      status: 1,
      output: `${guard} lowers the lines threshold from 90 to 85.\n`,
    });
  });

  it("fails when a package's config goes but the package stays", async () => {
    await rm(join(repo, guard));

    expect(check("main")).toEqual({
      status: 1,
      output: `${guard} no longer sets coverage thresholds.\n`,
    });
  });

  it("lets a package go with its config", async () => {
    await rm(join(repo, "packages/guard"), { recursive: true });

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  it("compares against where the branch left its base, not the base's tip", async () => {
    git("switch", "-q", "-c", "change");
    await write("packages/guard/src/index.ts", "export {};\n");
    git("add", "-A");
    git("commit", "-q", "-m", "Change the guard");
    git("switch", "-q", "main");
    await write(guard, config(95));
    git("commit", "-q", "-am", "Raise the guard's threshold");
    git("switch", "-q", "change");

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  describe("what coverage measures", () => {
    /** A config measuring `scope`, with `comment` above it. */
    const scoped = (scope: string, comment = "") =>
      `export default { test: { coverage: {\n${comment}${scope}\nthresholds: { lines: 90 } } } };\n`;
    const start = 'include: ["src/**"], exclude: ["src/test/**"],';

    beforeEach(async () => {
      await write(guard, scoped(start));
      git("commit", "-q", "-am", "Measure src");
    });

    it.each([
      [
        "narrowing include",
        'include: ["src/index.ts"], exclude: ["src/test/**"],',
        "include",
      ],
      [
        "widening exclude",
        'include: ["src/**"], exclude: ["src/test/**", "src/hard.ts"],',
        "exclude",
      ],
      ["removing include", 'exclude: ["src/test/**"],', "include"],
      ["removing exclude", 'include: ["src/**"],', "exclude"],
    ])("fails %s without a reason", async (_, scope, field) => {
      await write(guard, scoped(scope));

      expect(check("main")).toEqual({
        status: 1,
        output: `${guard} changes coverage.${field}, so its thresholds would measure other files. Undo it, or say why in a new comment in that file: // coverage-scope: <why>\n`,
      });
    });

    it("passes a change with a reason", async () => {
      await write(
        guard,
        scoped(
          'include: ["src/**"], exclude: ["src/test/**", "src/main.ts"],',
          "// coverage-scope: main.ts only starts the server; tests spawn it.\n",
        ),
      );

      expect(check("main")).toEqual({ status: 0, output: "" });
    });

    it("doesn't count a reason the base already had", async () => {
      const reason = "// coverage-scope: main.ts only starts the server.\n";
      await write(
        guard,
        scoped('include: ["src/**"], exclude: ["src/main.ts"],', reason),
      );
      git("commit", "-q", "-am", "Leave main.ts out");
      git("switch", "-q", "-c", "change");
      await write(
        guard,
        scoped('include: ["src/**"], exclude: ["src/*.ts"],', reason),
      );

      expect(check("main").status).toBe(1);
    });

    it("passes the same scope written another way", async () => {
      await write(
        guard,
        scoped(
          'include: [\n  "src/**",\n],\n// Helpers.\nexclude: ["src/test/**"],',
        ),
      );

      expect(check("main")).toEqual({ status: 0, output: "" });
    });
  });

  it("prints its usage without a base", () => {
    expect(check()).toEqual({
      status: 2,
      output: "Usage: check-coverage-thresholds.ts <base-ref>\n",
    });
  });
});
