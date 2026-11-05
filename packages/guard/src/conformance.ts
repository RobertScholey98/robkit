import cases from "../conformance.json" with { type: "json" };
import { readAccessRule, type AccessRule, type Decision } from "./guard.ts";

const sessions = [
  "unknown",
  "signed-out",
  "expired",
  "owner",
  "guest",
] as const;
const otherTokens = ["another-app", "core", "no-audience"] as const;
const outcomes = ["allow", "login", "refresh", "not-found"] as const;

/**
 * One row of the shared conformance cases. `session` names who is asking,
 * as the app knows them: someone it holds nothing for yet, someone core
 * just said isn't signed in, a holder of an expired token for the app, the
 * owner or a guest.
 */
export interface ConformanceCase {
  name: string;
  rule: AccessRule;
  session: (typeof sessions)[number];
  /** The roles a guest holds, by id. None if absent. */
  guestRoles?: string[];
  /**
   * With `unknown`, the owner's live token the visitor sends that isn't for
   * this app: another app's, core's own, or one with no audience. The app
   * treats it as no token at all.
   */
  otherToken?: (typeof otherTokens)[number];
  outcome: Decision["outcome"];
}

function oneOf<T extends string>(
  options: readonly T[],
  value: unknown,
): T | undefined {
  return options.find((option) => option === value);
}

function isRoleIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((role) => typeof role === "string")
  );
}

function readCase(value: unknown, index: number): ConformanceCase {
  const at = `conformance.json[${String(index)}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`${at} must be an object.`);
  }
  const field = (key: string): unknown =>
    key in value ? Reflect.get(value, key) : undefined;
  const name = field("name");
  if (typeof name !== "string") throw new Error(`${at} needs a name.`);
  const refuse = (problem: string) => new Error(`${at} (${name}): ${problem}`);

  const rule = readAccessRule(field("rule"));
  if (!rule) {
    throw refuse('rule must be an access rule, such as {"kind": "open"}.');
  }
  const session = oneOf(sessions, field("session"));
  if (!session) {
    throw refuse(`session must be one of ${sessions.join(", ")}.`);
  }
  const outcome = oneOf(outcomes, field("outcome"));
  if (!outcome) {
    throw refuse(`outcome must be one of ${outcomes.join(", ")}.`);
  }
  const guestRoles = field("guestRoles");
  if (guestRoles !== undefined && !isRoleIds(guestRoles)) {
    throw refuse("guestRoles must be a list of role ids, or left out.");
  }
  const otherToken = field("otherToken");
  const other = oneOf(otherTokens, otherToken);
  if (otherToken !== undefined && !other) {
    throw refuse(
      `otherToken must be one of ${otherTokens.join(", ")}, or left out.`,
    );
  }
  return {
    name,
    rule,
    session,
    ...(guestRoles !== undefined && { guestRoles }),
    ...(other && { otherToken: other }),
    outcome,
  };
}

/** The cases in `value`, as conformance.json holds them. Throws on a bad one. */
export function readConformanceCases(value: unknown): ConformanceCase[] {
  if (!Array.isArray(value)) {
    throw new Error("conformance.json must be a list of cases.");
  }
  return value.map(readCase);
}

/** The cases every adapter must pass, the same ones the guard passes. */
export const conformanceCases = readConformanceCases(cases);
