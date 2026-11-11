// The oldest Go robkit promises, in each place that says it, and the CI job
// that tests on it. `go/go.mod` names it; `check` tests on the newest.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = join(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** The `go` line of a go.mod, such as `1.26.0`. */
const goLine = (path: string) => /^go (\S+)$/m.exec(read(path))?.[1];

const oldest = goLine("go/go.mod");

/** Each place that tells a contributor or an owner which Go they need. */
const promises = [
  "CONTRIBUTING.md",
  "packages/create-robkit/templates/base/AGENTS.md",
  "packages/create-robkit/templates/stacks/go/AGENTS.md",
  "packages/dev/src/toolchain.ts",
];

const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

describe("the oldest Go robkit promises", () => {
  it("is a minor's first release in go/go.mod", () => {
    expect(oldest).toMatch(/^\d+\.\d+\.0$/);
  });

  it("is the template's go.mod's too", () => {
    expect(goLine("packages/create-robkit/templates/stacks/go/go.mod")).toBe(
      oldest,
    );
  });

  it.each(promises)("is the one %s names", (path) => {
    const named = [...read(path).matchAll(/Go (\d+\.\d+) or later/g)].map(
      ([, version]) => `${version ?? ""}.0`,
    );

    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set([oldest]));
  });

  it("is the one a CI job tests on, which the gate needs", () => {
    const workflow = record(parse(read(".github/workflows/ci.yml")));
    const jobs = record(workflow.jobs);
    const onOldest = Object.entries(jobs)
      .filter(([, job]) => {
        const steps = record(job).steps;
        return (
          Array.isArray(steps) &&
          steps.some(
            (step) =>
              record(record(step).with)["go-version-file"] === "go/go.mod",
          )
        );
      })
      .map(([name]) => name);

    expect(onOldest).toHaveLength(1);
    expect(record(jobs.gate).needs).toContain(onOldest[0]);
  });
});
