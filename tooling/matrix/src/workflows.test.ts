import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Job {
  name?: string;
  uses?: string;
  with?: Record<string, string>;
  needs?: string | string[];
  if?: string;
  "continue-on-error"?: boolean | string;
  strategy?: { "fail-fast"?: boolean; matrix?: { include?: string } };
  env?: Record<string, string>;
  steps?: { run?: string; "continue-on-error"?: boolean | string }[];
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

async function workflow(file: string): Promise<Workflow> {
  return parse(
    await readFile(
      new URL(`../../../.github/workflows/${file}`, import.meta.url),
      "utf8",
    ),
  ) as Workflow;
}

describe("the kit matrix workflow", () => {
  it("makes one job per combination the plan lists, named by its flags", async () => {
    const { jobs } = await workflow("kit-matrix.yml");

    expect(jobs.plan?.steps?.at(-1)?.run).toContain(
      'node tooling/matrix/src/plan.ts "$SET"',
    );
    expect(jobs.combination?.strategy?.matrix?.include).toBe(
      "${{ fromJSON(needs.plan.outputs.combinations) }}",
    );
    expect(jobs.combination?.name).toBe("${{ matrix.name }}");
    expect(jobs.combination?.env?.E2E_COMBINATION).toBe(
      "${{ toJSON(matrix.flags) }}",
    );
    expect(jobs.combination?.steps?.at(-1)?.run).toBe(
      "pnpm turbo run test:combination --filter=@internal/e2e",
    );
  });

  it("lets no combination fail, bun's and yarn's included", async () => {
    const { jobs } = await workflow("kit-matrix.yml");

    expect(jobs.combination?.strategy?.["fail-fast"]).toBe(false);
    for (const job of Object.values(jobs)) {
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps ?? []) {
        expect(step["continue-on-error"]).toBeUndefined();
      }
    }
    expect(jobs["every-combination"]).toMatchObject({
      name: "Every combination",
      needs: "combination",
      if: "always()",
      steps: [
        {
          run: expect.stringContaining('test "$RESULT" = success') as string,
        },
      ],
    });
  });

  it("keeps each test Postgres on the host's network", async () => {
    const { jobs } = await workflow("kit-matrix.yml");

    expect(jobs.combination?.env?.COMPOSE_FILE).toBe(
      "compose.yaml:${{ github.workspace }}/tooling/test-postgres/host-network.yaml",
    );
  });
});

describe("CI", () => {
  it("runs the pull request set on each pull request", async () => {
    const ci = await workflow("ci.yml");

    expect(Object.keys(ci.on)).toContain("pull_request");
    expect(ci.jobs["kit-matrix"]).toEqual({
      uses: "./.github/workflows/kit-matrix.yml",
      with: { set: "pull-request" },
    });
  });
});

describe("the nightly workflow", () => {
  it("runs every combination each night, and on demand", async () => {
    const nightly = await workflow("nightly.yml");

    expect(nightly.on).toEqual({
      schedule: [{ cron: "0 3 * * *" }],
      workflow_dispatch: null,
    });
    expect(nightly.jobs["kit-matrix"]).toEqual({
      uses: "./.github/workflows/kit-matrix.yml",
      with: { set: "nightly" },
    });
  });
});
