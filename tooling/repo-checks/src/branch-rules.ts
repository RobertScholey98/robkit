// AGENTS.md says CI's gate job is the one required check. That holds only
// while main's ruleset requires it, which lives in GitHub's settings rather
// than in the repo. This reads GitHub's answer for the rules in force on
// main (`gh api repos/<owner>/<repo>/rules/branches/main`) and fails unless
// they still require what the docs promise.

import { isRecord } from "@robkit/input";

const where = "main's ruleset (Settings, Rules, Rulesets)";

/** Each rule main must keep, how to find it in the answer, and what its loss means. */
const required: { has: (rules: unknown[]) => boolean; missing: string }[] = [
  {
    has: (rules) => rules.some((rule) => typeOf(rule) === "pull_request"),
    missing: `main doesn't require a pull request, so a push can skip CI's pull-request job. Add a "Require a pull request before merging" rule to ${where}.`,
  },
  {
    has: (rules) => rules.some(requiresGate),
    missing: `main doesn't require the gate status check, so a pull request can merge with CI failing. Add gate to the "Require status checks to pass" rule in ${where}.`,
  },
  {
    has: (rules) => rules.some((rule) => typeOf(rule) === "non_fast_forward"),
    missing: `main allows force pushes. Add a "Block force pushes" rule to ${where}.`,
  },
  {
    has: (rules) => rules.some((rule) => typeOf(rule) === "deletion"),
    missing: `main can be deleted. Add a "Restrict deletions" rule to ${where}.`,
  },
];

function typeOf(rule: unknown): unknown {
  return isRecord(rule) ? rule.type : undefined;
}

/** Whether `rule` is a status checks rule that names gate. */
function requiresGate(rule: unknown): boolean {
  if (!isRecord(rule) || rule.type !== "required_status_checks") return false;
  const checks = isRecord(rule.parameters)
    ? rule.parameters.required_status_checks
    : undefined;
  return (
    Array.isArray(checks) &&
    checks.some((check) => isRecord(check) && check.context === "gate")
  );
}

/**
 * What main's rules no longer require, from GitHub's answer for them: a
 * pull request, the gate check, and blocks on force pushes and deletion.
 */
export function branchRuleProblems(answer: unknown): string[] {
  if (!Array.isArray(answer)) {
    return [
      `GitHub's answer for main's rules isn't a list of rules: ${JSON.stringify(answer)}`,
    ];
  }
  return required
    .filter(({ has }) => !has(answer))
    .map(({ missing }) => missing);
}
