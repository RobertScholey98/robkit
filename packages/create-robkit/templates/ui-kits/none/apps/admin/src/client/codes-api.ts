import { call, isRecord, post, readWith, type Result } from "./core-call.ts";

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

export async function listCodes(core: string): Promise<Result<Code[]>> {
  return readWith(await call(core, "/codes", { method: "GET" }), (body) => {
    if (!isRecord(body) || !Array.isArray(body.codes)) return undefined;
    const codes = body.codes.map(readCode);
    return codes.every((code) => code !== undefined) ? codes : undefined;
  });
}

export async function mintCode(
  core: string,
  code: NewCode,
): Promise<Result<Code>> {
  return readWith(await call(core, "/codes", post(code)), readCode);
}

export async function revokeCode(
  core: string,
  id: string,
): Promise<Result<undefined>> {
  const result = await call(
    core,
    `/codes/${encodeURIComponent(id)}/revoke`,
    post(),
  );
  return result.ok ? { ok: true, value: undefined } : result;
}

/** The link that signs a guest in with `code`, on the hub beside core. */
export function introLink(core: string, code: string): string {
  const hub = new URL(core);
  hub.hostname = `hub.${hub.hostname.slice("core.".length)}`;
  return new URL(`/i/${code}`, hub.origin).href;
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

const standings = new Set<unknown>([
  "live",
  "revoked",
  "expired",
  "local-only",
]);

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
    !standings.has(standing) ||
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
    standing: standing as Standing,
  };
}

/** A date core sent as ISO text, null for none, or undefined if unreadable. */
function readDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
