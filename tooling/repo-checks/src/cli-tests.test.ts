// Every command-line script here, one that sets its exit code, has a test
// beside it that runs it as a child process. A broken entry point then fails
// here rather than first on CI.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;

async function text(file: string): Promise<string> {
  return readFile(join(here, file), "utf8");
}

describe("the repo checks' command-line scripts", () => {
  it("each have a test that runs them as a child process", async () => {
    const files = await readdir(here);
    const scripts: string[] = [];
    for (const file of files) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if ((await text(file)).includes("process.exit(")) scripts.push(file);
    }
    const untested: string[] = [];
    for (const script of scripts) {
      const test = script.replace(/\.ts$/, ".test.ts");
      const body = files.includes(test) ? await text(test) : "";
      const runsIt =
        body.includes(`"${script}"`) && body.includes("spawnSync(");
      if (!runsIt) untested.push(script);
    }

    expect(scripts).toContain("check-pr-ticket.ts");
    expect(untested).toEqual([]);
  });
});
