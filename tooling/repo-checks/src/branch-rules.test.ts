import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { branchRuleProblems } from "./branch-rules.ts";

/**
 * GitHub's answer to `gh api repos/RobertScholey98/robkit/rules/branches/main`
 * on 2026-11-06, with the "main requires gate" ruleset in force.
 */
const recorded: unknown = JSON.parse(
  await readFile(
    join(import.meta.dirname, "branch-rules.recorded.json"),
    "utf8",
  ),
);

const rules = (answer: unknown): Record<string, unknown>[] =>
  Array.isArray(answer) ? (answer as Record<string, unknown>[]) : [];

/** The recorded answer without the rules of `type`. */
const without = (type: string) =>
  rules(recorded).filter((rule) => rule.type !== type);

/** The recorded answer with the status checks rule requiring `contexts`. */
const requiring = (...contexts: string[]) =>
  rules(recorded).map((rule) =>
    rule.type === "required_status_checks"
      ? {
          ...rule,
          parameters: {
            strict_required_status_checks_policy: false,
            do_not_enforce_on_create: false,
            required_status_checks: contexts.map((context) => ({
              context,
              integration_id: 15368,
            })),
          },
        }
      : rule,
  );

const noPullRequest =
  "main doesn't require a pull request, so a push can skip CI's pull-request job. Add a \"Require a pull request before merging\" rule to main's ruleset (Settings, Rules, Rulesets).";
const noGate =
  "main doesn't require the gate status check, so a pull request can merge with CI failing. Add gate to the \"Require status checks to pass\" rule in main's ruleset (Settings, Rules, Rulesets).";
const noForcePushBlock =
  'main allows force pushes. Add a "Block force pushes" rule to main\'s ruleset (Settings, Rules, Rulesets).';
const noDeletionBlock =
  'main can be deleted. Add a "Restrict deletions" rule to main\'s ruleset (Settings, Rules, Rulesets).';

describe("branchRuleProblems", () => {
  it("passes main's recorded rules", () => {
    expect(branchRuleProblems(recorded)).toEqual([]);
  });

  it("fails rules that no longer require a pull request", () => {
    expect(branchRuleProblems(without("pull_request"))).toEqual([
      noPullRequest,
    ]);
  });

  it("fails rules that no longer require gate, or require no check", () => {
    expect(branchRuleProblems(requiring("check"))).toEqual([noGate]);
    expect(branchRuleProblems(requiring())).toEqual([noGate]);
    expect(branchRuleProblems(without("required_status_checks"))).toEqual([
      noGate,
    ]);
  });

  it("passes rules that require gate among other checks", () => {
    expect(branchRuleProblems(requiring("check", "gate"))).toEqual([]);
  });

  it("fails rules that allow force pushes or deletion", () => {
    expect(branchRuleProblems(without("non_fast_forward"))).toEqual([
      noForcePushBlock,
    ]);
    expect(branchRuleProblems(without("deletion"))).toEqual([noDeletionBlock]);
  });

  it("fails every rule when the ruleset is gone", () => {
    // GitHub's answer for a branch no ruleset covers.
    expect(branchRuleProblems([])).toEqual([
      noPullRequest,
      noGate,
      noForcePushBlock,
      noDeletionBlock,
    ]);
  });

  it("fails an answer that isn't a list of rules, saying what came", () => {
    expect(branchRuleProblems({ message: "Not Found", status: "404" })).toEqual(
      [
        'GitHub\'s answer for main\'s rules isn\'t a list of rules: {"message":"Not Found","status":"404"}',
      ],
    );
  });
});
