import cases from "../conformance.json" with { type: "json" };
import type { AccessRule, Decision } from "./guard.ts";

/**
 * One row of the shared conformance cases. `session` names who is asking,
 * as the app knows them: someone it holds nothing for yet, someone core
 * just said isn't signed in, a holder of an expired token for the app, the
 * owner or a guest.
 */
export interface ConformanceCase {
  name: string;
  rule: AccessRule;
  session: "unknown" | "signed-out" | "expired" | "owner" | "guest";
  /** The roles a guest holds, by id. None if absent. */
  guestRoles?: string[];
  /**
   * With `unknown`, the owner's live token the visitor sends that isn't for
   * this app: another app's, core's own, or one with no audience. The app
   * treats it as no token at all.
   */
  otherToken?: "another-app" | "core" | "no-audience";
  outcome: Decision["outcome"];
}

/** The cases every adapter must pass, the same ones the guard passes. */
export const conformanceCases = cases as ConformanceCase[];
