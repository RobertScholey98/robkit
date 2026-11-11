// A page that reads a file outside site/ must list it among the turbo
// inputs of the site's build and tests, or a gate answers from cache after
// the file changes.

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { matchesGlob } from "node:path/posix";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";

interface Task {
  inputs?: string[];
}

const turbo = JSON.parse(
  await readFile(join(repoRoot, "turbo.json"), "utf8"),
) as { tasks: Record<string, Task | undefined> };

const inputsOf = (task: string) =>
  turbo.tasks[`@internal/site#${task}`]?.inputs ?? [];

/** Each repo path a file in src reads with `readRepoFile("...")`. */
async function pathsRead(): Promise<string[]> {
  const paths = new Set<string>();
  for await (const file of glob("src/**/*.{ts,astro,mdx}", {
    cwd: join(repoRoot, "site"),
    exclude: ["**/*.test.ts"],
  })) {
    const text = await readFile(join(repoRoot, "site", file), "utf8");
    for (const [, path] of text.matchAll(/readRepoFile\(\s*"([^"]+)"/g)) {
      if (path !== undefined) paths.add(path);
    }
  }
  return [...paths].sort();
}

describe("the site's turbo inputs", () => {
  it("are the same for its build and both its tests", () => {
    expect(inputsOf("build")).not.toEqual([]);
    expect(inputsOf("test")).toEqual(inputsOf("build"));
    expect(inputsOf("test:unit")).toEqual(inputsOf("build"));
  });

  it("hold every repo file a page reads", async () => {
    const outside = inputsOf("build")
      .filter((input) => input.startsWith("$TURBO_ROOT$/"))
      .map((input) => input.slice("$TURBO_ROOT$/".length));
    const read = await pathsRead();

    expect(read).toContain("README.md");
    expect(
      read.filter(
        (path) => !outside.some((pattern) => matchesGlob(path, pattern)),
      ),
    ).toEqual([]);
  });
});
