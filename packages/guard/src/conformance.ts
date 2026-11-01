import cases from "../conformance.json" with { type: "json" };
import type { AccessRule, Decision } from "./guard.ts";

/**
 * One row of the shared conformance cases. `session` names who is asking:
 * nobody signed in, a holder of an expired token, or the owner.
 */
export interface ConformanceCase {
  name: string;
  rule: AccessRule;
  session: "signed-out" | "expired" | "owner";
  outcome: Decision["outcome"];
}

/** The cases every adapter must pass, the same ones the guard passes. */
export const conformanceCases = cases as ConformanceCase[];
