// The release workflow, read from its file: who can start it, where it
// runs, and which job and step hold what. GitHub runs it only when R
// presses the button, so these tests are its proof before then.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "@robkit/input";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = join(import.meta.dirname, "../../..");
const releaseFile = join(root, ".github/workflows/release.yml");

let text: string;
let workflow: Record<string, unknown>;

/** A value from the workflow as a record, or an empty one. */
const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

/** Each step of `job`, as records. */
function steps(job: string): Record<string, unknown>[] {
  const list = record(record(workflow.jobs)[job]).steps;
  return Array.isArray(list) ? list.map(record) : [];
}

const job = (name: string) => record(record(workflow.jobs)[name]);

/** The index of the first step of `job` whose `run` includes `command`. */
const stepRunning = (name: string, command: string) =>
  steps(name).findIndex(
    ({ run }) => typeof run === "string" && run.includes(command),
  );

beforeAll(async () => {
  text = await readFile(releaseFile, "utf8");
  workflow = record(parse(text));
});

describe(".github/workflows/release.yml", () => {
  it("starts only by hand", () => {
    expect(Object.keys(record(workflow.on))).toEqual(["workflow_dispatch"]);
  });

  it("stops at once on any ref but main", () => {
    const [first] = steps("gate");

    expect(first).toMatchObject({ if: "github.ref != 'refs/heads/main'" });
    expect(first?.run).toContain("exit 1");
    expect(job("publish")).toMatchObject({
      needs: "gate",
      if: "github.ref == 'refs/heads/main'",
    });
  });

  it("publishes only in the release environment", () => {
    expect(job("publish").environment).toBe("release");
    expect(Object.keys(record(workflow.jobs)).sort()).toEqual([
      "gate",
      "publish",
    ]);
  });

  it("lets no job but the publish job write", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job("gate").permissions).toEqual({ contents: "read" });
    expect(job("publish").permissions).toEqual({
      contents: "write",
      "id-token": "write",
    });
  });

  it("gives NPM_TOKEN to the publish step alone", () => {
    const holders = Object.keys(record(workflow.jobs)).flatMap((name) =>
      steps(name)
        .filter((step) => JSON.stringify(step).includes("NPM_TOKEN"))
        .map((step) => `${name}: ${String(step.id)}`),
    );

    expect(holders).toEqual(["publish: publish"]);
    expect(steps("publish").find(({ id }) => id === "publish")).toMatchObject({
      env: { NPM_TOKEN: "${{ secrets.NPM_TOKEN }}" },
      run: "node tooling/repo-checks/src/release-publish.ts",
    });
    // No secret anywhere else: not in a job's or the workflow's env.
    expect(text.match(/secrets\./g)).toHaveLength(1);
  });

  it("runs the full gate, then the dry run, before it publishes", () => {
    expect(stepRunning("gate", "pnpm check:all")).toBeGreaterThan(0);
    const dryRun = stepRunning("publish", "pnpm release:dry-run");
    const publish = stepRunning("publish", "release-publish.ts");

    expect(dryRun).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(dryRun);
  });

  it("tags once, after the publish, from what the publish step says", () => {
    const publish = stepRunning("publish", "release-publish.ts");
    const tag = stepRunning("publish", "refs/tags/");
    const step = steps("publish")[tag];

    expect(tag).toBe(publish + 1);
    expect(step).toMatchObject({
      if: "steps.publish.outputs.tag != ''",
      env: {
        GH_TOKEN: "${{ github.token }}",
        TAG: "${{ steps.publish.outputs.tag }}",
      },
    });
    expect(steps("publish")).toHaveLength(tag + 1);
  });

  it("keeps git credentials out of every checkout", () => {
    const checkouts = ["gate", "publish"].flatMap((name) =>
      steps(name).filter(
        ({ uses }) =>
          typeof uses === "string" && uses.startsWith("actions/checkout@"),
      ),
    );

    expect(checkouts).toHaveLength(2);
    for (const checkout of checkouts) {
      expect(checkout.with).toMatchObject({ "persist-credentials": false });
    }
  });

  it("pins every action to a commit, with its version beside it", () => {
    const uses = text
      .split("\n")
      .filter((line) => /^\s*-?\s*uses:/.test(line))
      .map((line) => line.trim().replace(/^-\s*/, ""));

    expect(uses.length).toBeGreaterThan(0);
    expect(
      uses.filter(
        (line) =>
          !/^uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line),
      ),
    ).toEqual([]);
  });
});

describe(".github/workflows/ci.yml", () => {
  it("runs the release's dry run on every pull request", async () => {
    workflow = record(
      parse(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")),
    );

    expect(stepRunning("pull-request", "pnpm release:dry-run")).toBeGreaterThan(
      0,
    );
  });
});
