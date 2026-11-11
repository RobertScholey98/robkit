// Every GitHub workflow, this repo's and the template's an install copies.
// A tag can be moved to other code, so each action is named by commit.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unpinnedActions } from "./workflows.ts";

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
});
