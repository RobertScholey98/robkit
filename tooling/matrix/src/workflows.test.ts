import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Job {
  name?: string;
  "timeout-minutes"?: number;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  uses?: string;
  with?: Record<string, string>;
  needs?: string | string[];
  if?: string;
  "continue-on-error"?: boolean | string;
  strategy?: {
    "fail-fast"?: boolean;
    matrix?: { include?: string; install?: string[] };
  };
  env?: Record<string, string>;
  steps?: {
    run?: string;
    uses?: string;
    "continue-on-error"?: boolean | string;
  }[];
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

  it("deploys every production install each night", async () => {
    const nightly = await workflow("nightly.yml");

    expect(nightly.jobs.production).toEqual({
      uses: "./.github/workflows/production.yml",
    });
  });
});

describe("the production workflow", () => {
  it("runs on each push to main, on pull requests, and when nightly calls it", async () => {
    const production = await workflow("production.yml");

    expect(production.on).toEqual({
      push: { branches: ["main"] },
      pull_request: { types: ["opened", "synchronize", "reopened", "labeled"] },
      workflow_call: null,
    });
  });

  it("runs on a pull request only once it's labelled production", async () => {
    const { jobs } = await workflow("production.yml");

    expect(jobs.production?.if).toBe(
      "github.event_name != 'pull_request' || (contains(github.event.pull_request.labels.*.name, 'production') && (github.event.action != 'labeled' || github.event.label.name == 'production'))",
    );
  });

  it("deploys each install in its own job, and fails the run when one fails", async () => {
    const { jobs } = await workflow("production.yml");
    const job = jobs.production;

    expect(job?.strategy).toEqual({
      "fail-fast": false,
      matrix: { install: ["default", "prisma", "kysely-on-bun"] },
    });
    expect(job?.env?.E2E_PRODUCTION_INSTALL).toBe("${{ matrix.install }}");
    expect(job?.steps?.at(-1)?.run).toBe(
      "pnpm --filter @internal/e2e test:production",
    );
    expect(job?.["continue-on-error"]).toBeUndefined();
    for (const step of job?.steps ?? []) {
      expect(step["continue-on-error"]).toBeUndefined();
    }
  });

  it("keeps image layers in GitHub's cache between runs", async () => {
    const { jobs } = await workflow("production.yml");
    const job = jobs.production;

    expect(job?.env?.ROBKIT_BUILD_CACHE).toBe("type=gha");
    // buildx's own builder can export a cache, and the runtime action hands
    // the build the cache service's token.
    expect(job?.steps?.map((step) => step.uses).filter(Boolean)).toEqual(
      expect.arrayContaining([
        "docker/setup-buildx-action@v4",
        "crazy-max/ghaction-github-runtime@v4",
      ]),
    );
  });
});
