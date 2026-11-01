import { isLocal } from "./domain.ts";

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
