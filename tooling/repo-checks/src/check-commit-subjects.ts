// Checks commit subjects against subjectProblems. The commit-msg hook passes
// the message file git wrote:
//   node tooling/repo-checks/src/check-commit-subjects.ts <message-file>
// A merge being committed passes, since git names its subject.
// CI passes a pull request's commits, and merge commits are skipped:
//   node tooling/repo-checks/src/check-commit-subjects.ts --range <base>..<head>
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { subjectOf, subjectProblems } from "./commit-subject.ts";

interface Message {
  /** How the report names the commit. */
  label: string;
  text: string;
}

function messagesInRange(range: string): Message[] {
  const log = execFileSync(
    "git",
    ["log", "--no-merges", "--reverse", "-z", "--format=%h%n%B", range],
    { encoding: "utf8" },
  );
  return log
    .split("\0")
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [hash = "", ...body] = entry.split("\n");
      const text = body.join("\n");
      return { label: `Commit ${hash} "${subjectOf(text) ?? ""}"`, text };
    });
}

/** Whether the commit being made concludes a merge, which the range check skips too. */
function committingMerge(): boolean {
  const merging = spawnSync("git", [
    "rev-parse",
    "-q",
    "--verify",
    "MERGE_HEAD",
  ]);
  return merging.status === 0;
}

function messageInFile(path: string): Message[] {
  if (committingMerge()) return [];
  const text = readFileSync(path, "utf8");
  return [{ label: `Commit subject "${subjectOf(text) ?? ""}"`, text }];
}

const [first, second] = process.argv.slice(2);
if (first === undefined || (first === "--range" && second === undefined)) {
  console.error(
    "Usage: check-commit-subjects.ts <message-file> | --range <base>..<head>",
  );
  process.exit(2);
}
const messages =
  first === "--range" && second !== undefined
    ? messagesInRange(second)
    : messageInFile(first);

let failed = false;
for (const { label, text } of messages) {
  const problems = subjectProblems(text);
  if (problems.length === 0) continue;
  failed = true;
  console.error(`${label}:`);
  for (const problem of problems) console.error(`  ${problem}`);
}
if (failed) process.exit(1);
