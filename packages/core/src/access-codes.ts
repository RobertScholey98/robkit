import { randomInt } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { CodeId } from "@robkit/guard";
import { isLocal } from "@robkit/session/addresses";
import type { InputProblem } from "@robkit/input";
import type { Database } from "./database.ts";
import { accessCodes } from "./schema.ts";

declare const accessCodeBrand: unique symbol;

/** An access code as core stores it: 3 to 32 upper-case letters or digits. */
export type AccessCode = string & { readonly [accessCodeBrand]: true };

function isAccessCode(code: string): code is AccessCode {
  return /^[A-Z0-9]{3,32}$/.test(code);
}

/** Reads what someone typed as an access code, ignoring case and spaces around it. */
export function parseAccessCode(input: string): AccessCode | undefined {
  const code = input.trim().toUpperCase();
  return isAccessCode(code) ? code : undefined;
}

// No look-alikes such as 0 and O or 1 and I, so a code survives being read
// aloud or copied from a screen.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generatedLength = 5;
const generateAttempts = 5;

function generateAccessCode(): AccessCode {
  const characters = Array.from({ length: generatedLength }, () =>
    alphabet.charAt(randomInt(alphabet.length)),
  );
  const code = characters.join("");
  if (!isAccessCode(code)) throw new Error(`${code} isn't an access code.`);
  return code;
}

/** The code every install is seeded with, for trying robkit out locally. */
export const testCode = "TEST";

/** Whether a code signs a guest in, and if not, why not. */
export type Standing = "live" | "revoked" | "expired" | "local-only";

/**
 * Whether a code works right now on an install's domain. Sign-in and every
 * read of a guest's session ask this, so a code that stops working ends its
 * sessions at their next refresh.
 */
export function standingOf(
  {
    code,
    expiresAt,
    revokedAt,
  }: { code: string; expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
  domain: string,
): Standing {
  if (revokedAt) return "revoked";
  if (expiresAt && expiresAt <= now) return "expired";
  if (code === testCode && !isLocal(domain)) return "local-only";
  return "live";
}

/** An access code as admin shows it to the owner. */
export interface CodeView {
  id: CodeId;
  code: string;
  /** The guest's name. */
  name: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  standing: Standing;
}

type CodeRow = typeof accessCodes.$inferSelect;

function viewOf(row: CodeRow, now: Date, domain: string): CodeView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    standing: standingOf(row, now, domain),
  };
}

/** What the owner asks for when minting a code. */
export interface NewCode {
  name: string;
  /** The owner's own choice of code; core generates one without it. */
  code?: AccessCode;
  expiresAt: Date | null;
}

/** The guest's name, code and expiry the owner sent, or why they won't do. */
export function readNewCode(
  fields: Record<string, unknown>,
  now: Date,
): NewCode | InputProblem {
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  if (name.length < 1 || name.length > 80) {
    return { error: "Give the guest a name of 1 to 80 characters." };
  }
  let code: AccessCode | undefined;
  if (fields.code !== undefined && fields.code !== null) {
    code =
      typeof fields.code === "string"
        ? parseAccessCode(fields.code)
        : undefined;
    if (!code) return { error: "Use 3 to 32 letters or digits for the code." };
  }
  let expiresAt: Date | null = null;
  if (fields.expiresAt !== undefined && fields.expiresAt !== null) {
    expiresAt =
      typeof fields.expiresAt === "string" ? new Date(fields.expiresAt) : null;
    if (!expiresAt || !(expiresAt > now)) {
      return { error: "Pick an expiry in the future." };
    }
  }
  return code ? { name, code, expiresAt } : { name, expiresAt };
}

export type Mint = { outcome: "minted"; code: CodeView } | { outcome: "taken" };

export async function listCodes(
  db: Database,
  now: Date,
  domain: string,
): Promise<CodeView[]> {
  const rows = await db
    .select()
    .from(accessCodes)
    .orderBy(desc(accessCodes.createdAt));
  return rows.map((row) => viewOf(row, now, domain));
}

/**
 * Stores a new code. A code the owner chose is `taken` if it exists already.
 * A generated one that exists is replaced by another, a few times over.
 */
export async function mintCode(
  db: Database,
  { name, code, expiresAt }: NewCode,
  now: Date,
  domain: string,
): Promise<Mint> {
  const insert = async (value: AccessCode) => {
    const [row] = await db
      .insert(accessCodes)
      .values({ code: value, name, expiresAt, createdAt: now })
      .onConflictDoNothing({ target: accessCodes.code })
      .returning();
    return row;
  };
  if (code !== undefined) {
    const row = await insert(code);
    return row
      ? { outcome: "minted", code: viewOf(row, now, domain) }
      : { outcome: "taken" };
  }
  for (let attempt = 0; attempt < generateAttempts; attempt++) {
    const row = await insert(generateAccessCode());
    if (row) return { outcome: "minted", code: viewOf(row, now, domain) };
  }
  throw new Error(
    `Core couldn't find a free access code in ${String(generateAttempts)} attempts: each code it generated was already in core.access_codes.`,
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` could be a row id; Postgres errors on anything else. */
export function isUuid(id: string): boolean {
  return uuid.test(id);
}

/**
 * Revokes a code, keeping the time it was first revoked. Answers whether
 * the code exists.
 */
export async function revokeCode(
  db: Database,
  id: CodeId,
  now: Date,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [row] = await db
    .update(accessCodes)
    .set({
      revokedAt: sql`coalesce(${accessCodes.revokedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(eq(accessCodes.id, id))
    .returning({ id: accessCodes.id });
  return row !== undefined;
}
