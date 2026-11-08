// Checks that main's ruleset still requires a pull request and the gate
// check, and blocks force pushes and deletion. CI's pull-request job pipes
// GitHub's answer in:
//   gh api "repos/$GITHUB_REPOSITORY/rules/branches/main" | node tooling/repo-checks/src/check-branch-rules.ts
import { text } from "node:stream/consumers";
import { branchRuleProblems } from "./branch-rules.ts";

const raw = await text(process.stdin);
let answer: unknown;
try {
  answer = JSON.parse(raw);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `GitHub's answer for main's rules isn't JSON (${reason}). It began: ${raw.slice(0, 200)}`,
  );
  process.exit(1);
}
const problems = branchRuleProblems(answer);
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(
  "main requires a pull request and the gate check, and blocks force pushes and deletion.",
);
