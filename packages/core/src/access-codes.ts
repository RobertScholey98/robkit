import { randomInt } from "node:crypto";
import { desc } from "drizzle-orm";
import type { Database } from "./database.ts";
import { isLocal } from "./domain.ts";
import { accessCodes } from "./schema.ts";

declare const accessCodeBrand: unique symbol;

/** An access code as core stores it: 3 to 32 upper-case letters or digits. */
export type AccessCode = string & { readonly [accessCodeBrand]: true };

/** Reads what someone typed as an access code, ignoring case and spaces around it. */
export function parseAccessCode(input: string): AccessCode | undefined {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{3,32}$/.test(code) ? (code as AccessCode) : undefined;
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
  return characters.join("") as AccessCode;
}

/** The code every install is seeded with, for trying robkit out locally. */
const testCode = "TEST";

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
  id: string;
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
    name: row.label,
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

export type Mint = { outcome: "minted"; code: CodeView } | { outcome: "taken" };

/** Every code, newest first. */
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
      .values({ code: value, label: name, expiresAt, createdAt: now })
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
  throw new Error("Core couldn't find a free access code.");
}
