import { installAt } from "@robkit/input/addresses";
import { callCore, listOf, problem, type Result } from "@internal/core-client";
import { type InputProblem, isProblem, isRecord } from "@robkit/input";

/** Whether a code signs a guest in, and if not, why not. */
export type Standing = "live" | "revoked" | "expired" | "local-only";

/** An access code, as core lists it for the owner. */
export interface Code {
  id: string;
  code: string;
  /** The guest's name. */
  name: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  standing: Standing;
}

export interface NewCode {
  name: string;
  code?: string;
  expiresAt?: Date;
}

export function listCodes(core: string): Promise<Result<Code[]>> {
  return callCore(core, "GET", "/codes", {
    read: (body) =>
      isRecord(body)
        ? listOf(body.codes, "codes", readCode)
        : problem("The codes' answer isn't an object."),
  });
}

export function mintCode(core: string, code: NewCode): Promise<Result<Code>> {
  return callCore(core, "POST", "/codes", { body: code, read: readCode });
}

export function revokeCode(
  core: string,
  id: string,
): Promise<Result<undefined>> {
  return callCore(core, "POST", `/codes/${encodeURIComponent(id)}/revoke`);
}

/** The link that signs a guest in with `code`, on the hub beside core. */
export function introLink(core: string, code: string): string {
  const hub = installAt(core, "core")?.origin("hub");
  if (!hub) throw new Error(`core must be on core.<domain>, not ${core}`);
  return new URL(`/i/${code}`, hub).href;
}

/**
 * When a code picked to last through `day`, a date input's `YYYY-MM-DD`,
 * stops working: the start of the next day where the owner is.
 */
export function expiryAfter(day: string): Date | undefined {
  const [year, month, date] = day.split("-").map(Number);
  if (year === undefined || month === undefined || date === undefined) {
    return undefined;
  }
  return new Date(year, month - 1, date + 1);
}

const standings: readonly Standing[] = [
  "live",
  "revoked",
  "expired",
  "local-only",
];

function isStanding(value: unknown): value is Standing {
  return standings.some((standing) => standing === value);
}

function readCode(body: unknown): Code | InputProblem {
  if (!isRecord(body)) return problem("The code isn't an object.");
  const { id, code, name, standing } = body;
  if (typeof id !== "string") return problem("The code's id isn't text.");
  if (typeof code !== "string") return problem("The code's code isn't text.");
  if (typeof name !== "string") return problem("The code's name isn't text.");
  if (!isStanding(standing)) {
    return problem(`The code's standing isn't one of ${standings.join(", ")}.`);
  }
  const expiresAt = readDate(body.expiresAt, "The code's expiresAt");
  if (isProblem(expiresAt)) return expiresAt;
  const revokedAt = readDate(body.revokedAt, "The code's revokedAt");
  if (isProblem(revokedAt)) return revokedAt;
  const createdAt = readDate(body.createdAt, "The code's createdAt");
  if (isProblem(createdAt)) return createdAt;
  if (createdAt === null) return problem("The code's createdAt is null.");
  return {
    id,
    code,
    name,
    expiresAt,
    revokedAt,
    createdAt,
    standing,
  };
}

/** A date core sent as ISO text, `what`, or null for none. */
function readDate(value: unknown, what: string): Date | null | InputProblem {
  if (value === null) return null;
  const date = typeof value === "string" ? new Date(value) : undefined;
  return date === undefined || Number.isNaN(date.getTime())
    ? problem(`${what} isn't a date as ISO text, or null.`)
    : date;
}
