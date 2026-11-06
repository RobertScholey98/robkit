import { installAt } from "@robkit/input/addresses";
import { callCore, isRecord, listOf, type Result } from "@internal/core-client";

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
    read: (body) => (isRecord(body) ? listOf(body.codes, readCode) : undefined),
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

function readCode(body: unknown): Code | undefined {
  if (!isRecord(body)) return undefined;
  const { id, code, name, standing } = body;
  const expiresAt = readDate(body.expiresAt);
  const revokedAt = readDate(body.revokedAt);
  const createdAt = readDate(body.createdAt);
  if (
    typeof id !== "string" ||
    typeof code !== "string" ||
    typeof name !== "string" ||
    !isStanding(standing) ||
    expiresAt === undefined ||
    revokedAt === undefined ||
    createdAt === undefined ||
    createdAt === null
  ) {
    return undefined;
  }
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

/** A date core sent as ISO text, null for none, or undefined if unreadable. */
function readDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
