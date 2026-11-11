// Every GitHub workflow, this repo's and the template's an install copies.
// A tag can be moved to other code, so each action is named by commit.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { systemPackageInstalls, unpinnedActions } from "./workflows.ts";

const root = join(import.meta.dirname, "../../..");

const workflows = globSync(
  [
    ".github/workflows/*.yml",
    "packages/create-robkit/templates/**/.github/workflows/*.yml",
  ],
  { cwd: root },
).map((path) => path.replaceAll("\\", "/"));

const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("unpinnedActions", () => {
  it("passes an action named by commit, with its version beside it", () => {
    expect(
      unpinnedActions(
        "ci.yml",
        "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n",
      ),
    ).toEqual([]);
  });

  it("passes a workflow of the same repo", () => {
    expect(
      unpinnedActions(
        "nightly.yml",
        "    uses: ./.github/workflows/production.yml\n",
      ),
    ).toEqual([]);
  });

  it.each([
    "      - uses: actions/checkout@v7\n",
    "        uses: actions/setup-go@v7.0.0\n",
    "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n",
    "      - uses: actions/checkout@main # v7.0.1\n",
    "      - uses: 'actions/checkout@v7'\n",
  ])("fails `%s`", (line) => {
    expect(unpinnedActions("ci.yml", `jobs:\n${line}`)).toEqual([
      `ci.yml line 2 names ${line.trim().replace(/^- /, "")} by tag or branch. Name the action by its commit, with the version in a comment: uses: owner/action@<commit> # v1.2.3. gh api repos/<owner>/<action>/git/ref/tags/<tag> gives the commit.`,
    ]);
  });
});

describe("systemPackageInstalls", () => {
  it("passes a step that installs the browser alone", () => {
    expect(
      systemPackageInstalls(
        "ci.yml",
        "      - run: pnpm --filter @internal/e2e exec playwright install chromium\n",
      ),
    ).toEqual([]);
  });

  it("passes a comment that names such a step", () => {
    expect(
      systemPackageInstalls(
        "ci.yml",
        "      # Not --with-deps, which runs apt-get install.\n",
      ),
    ).toEqual([]);
  });

  it.each([
    "      - run: pnpm --filter @internal/e2e exec playwright install --with-deps chromium\n",
    "      - run: npx playwright install-deps chromium\n",
    "      - run: sudo apt-get install -y fonts-unifont\n",
    "        run: sudo apt-get update && sudo apt-get -y install jq\n",
    "      - run: sudo apt install -y jq\n",
  ])("fails `%s`", (line) => {
    expect(systemPackageInstalls("ci.yml", `jobs:\n${line}`)).toEqual([
      `ci.yml line 2 installs a system package: ${line.trim().replace(/^- /, "")}. Those come from Ubuntu's mirrors, and the run fails when the runner can't reach them. The runner's image has the libraries Chromium needs, so install the browser alone, with playwright install chromium.`,
    ]);
  });
});

describe("the repo's and the template's workflows", () => {
  it("are found", () => {
    expect(workflows).toContain(".github/workflows/ci.yml");
    expect(workflows).toContain(
      "packages/create-robkit/templates/base/.github/workflows/ci.yml",
    );
  });

  it("name every action by commit", () => {
    expect(
      workflows.flatMap((path) => unpinnedActions(path, read(path))),
    ).toEqual([]);
  });

  // On 2026-11-11 GitHub's runners couldn't resolve Ubuntu's mirrors for
  // over two hours, and every run failed at playwright install --with-deps.
  it("install no system package, so a run doesn't need Ubuntu's mirrors", () => {
    expect(
      workflows.flatMap((path) => systemPackageInstalls(path, read(path))),
    ).toEqual([]);
  });

  it.each(["check", "pull-request"])(
    "give ci.yml's %s job a time limit",
    (name) => {
      const workflow: unknown = parse(read(".github/workflows/ci.yml"));
      const jobs = isRecord(workflow) ? workflow.jobs : undefined;
      const job = isRecord(jobs) ? jobs[name] : undefined;

      expect(isRecord(job) ? job["timeout-minutes"] : undefined).toEqual(
        expect.any(Number),
      );
    },
  );
});
