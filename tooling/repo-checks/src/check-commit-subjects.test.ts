import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-commit-subjects.ts");

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function commit(subject: string): string {
  git("commit", "--allow-empty", "--no-verify", "-q", "-m", subject);
  return git("rev-parse", "--short", "HEAD");
}

function check(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, ...args],
    { cwd: repo, encoding: "utf8" },
  );
  return { status, output: stdout + stderr };
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "commit-subjects-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  commit("Start");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("check-commit-subjects", () => {
  it("passes a message file whose subject is fine", async () => {
    await writeFile(join(repo, "MSG"), "Add the gate job\n\n# a comment\n");

    expect(check("MSG")).toEqual({ status: 0, output: "" });
  });

  it("fails a message file whose subject breaks a rule", async () => {
    await writeFile(join(repo, "MSG"), "added the gate job.\n");

    expect(check("MSG")).toEqual({
      status: 1,
      output: [
        'Commit subject "added the gate job.":',
        "  The subject ends with a period.",
        "  The subject starts with a capital letter.",
        '  The subject starts with an imperative verb ("Add", not "Added" or "Adding").',
        "",
      ].join("\n"),
    });
  });

  it("checks every commit in a range and skips merge commits", () => {
    const base = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "side");
    commit("Add a thing");
    const bad = commit("Fixing a thing");
    git("checkout", "-q", "main");
    commit("Add another thing");
    git("merge", "-q", "--no-ff", "--no-verify", "-m", "merge side", "side");

    expect(check("--range", `${base}..HEAD`)).toEqual({
      status: 1,
      output: [
        `Commit ${bad} "Fixing a thing":`,
        '  The subject starts with an imperative verb ("Add", not "Added" or "Adding").',
        "",
      ].join("\n"),
    });
  });

  it("passes a range whose subjects are all fine", () => {
    const base = git("rev-parse", "HEAD");
    commit("Add a thing");

    expect(check("--range", `${base}..HEAD`)).toEqual({
      status: 0,
      output: "",
    });
  });
});
