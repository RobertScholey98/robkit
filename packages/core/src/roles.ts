import { isProblem, type InputProblem } from "@robkit/session/input";
import { readCodeId, type CodeId, type RoleId } from "@robkit/guard";
import { asc, eq, inArray } from "drizzle-orm";
import { isUuid, testCode } from "./access-codes.ts";
import type { Database } from "./database.ts";
import { accessCodes, codeRoles, roles } from "./schema.ts";

/** A role as admin shows it: its name and the codes that hold it. */
export interface RoleView {
  id: RoleId;
  name: string;
  codeIds: CodeId[];
}

/** What the owner sends to create a role. */
export interface NewRole {
  name: string;
  codeIds: CodeId[];
}

/** The codes the owner ticked for a role, or why they won't do. */
export function readCodeIds(
  fields: Record<string, unknown>,
): { codeIds: CodeId[] } | InputProblem {
  const problem = { error: "Send codeIds, a list of code ids." };
  const { codeIds } = fields;
  if (!Array.isArray(codeIds)) return problem;
  const read: CodeId[] = [];
  for (const value of codeIds) {
    const id = readCodeId(value);
    if (id === undefined) return problem;
    read.push(id);
  }
  return { codeIds: read };
}

/** The role's name and the codes the owner ticked, or why they won't do. */
export function readNewRole(
  fields: Record<string, unknown>,
): NewRole | InputProblem {
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  if (name.length < 1 || name.length > 40) {
    return { error: "Give the role a name of 1 to 40 characters." };
  }
  const holders = readCodeIds(fields);
  return isProblem(holders) ? holders : { name, ...holders };
}

export type RoleCreation =
  | { outcome: "created"; role: RoleView }
  | { outcome: "taken" }
  | { outcome: "unknown-code" };

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function listRoles(db: Database): Promise<RoleView[]> {
  const [rows, holders] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.name)),
    db.select().from(codeRoles),
  ]);
  return rows.map(({ id, name }) => ({
    id,
    name,
    codeIds: holders
      .filter((holder) => holder.roleId === id)
      .map((holder) => holder.codeId),
  }));
}

/** Each code id once, if every one names a code that exists. */
async function existingCodes(
  tx: Transaction,
  codeIds: CodeId[],
): Promise<CodeId[] | undefined> {
  const unique = [...new Set(codeIds)];
  if (!unique.every(isUuid)) return undefined;
  if (unique.length === 0) return unique;
  const found = await tx
    .select({ id: accessCodes.id })
    .from(accessCodes)
    .where(inArray(accessCodes.id, unique));
  return found.length === unique.length ? unique : undefined;
}

export async function createRole(
  db: Database,
  { name, codeIds }: NewRole,
  now: Date,
): Promise<RoleCreation> {
  return db.transaction(async (tx) => {
    const holders = await existingCodes(tx, codeIds);
    if (!holders) return { outcome: "unknown-code" };
    const [role] = await tx
      .insert(roles)
      .values({ name, createdAt: now })
      .onConflictDoNothing({ target: roles.name })
      .returning({ id: roles.id, name: roles.name });
    if (!role) return { outcome: "taken" };
    if (holders.length > 0) {
      await tx
        .insert(codeRoles)
        .values(holders.map((codeId) => ({ codeId, roleId: role.id })));
    }
    return { outcome: "created", role: { ...role, codeIds: holders } };
  });
}

export type MembershipChange =
  | { outcome: "changed"; role: RoleView }
  | { outcome: "unknown-role" }
  | { outcome: "unknown-code" };

/** Makes exactly these codes hold the role. */
export async function setRoleCodes(
  db: Database,
  roleId: RoleId,
  codeIds: CodeId[],
): Promise<MembershipChange> {
  if (!isUuid(roleId)) return { outcome: "unknown-role" };
  return db.transaction(async (tx) => {
    const [role] = await tx
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for("update");
    if (!role) return { outcome: "unknown-role" };
    const holders = await existingCodes(tx, codeIds);
    if (!holders) return { outcome: "unknown-code" };
    await tx.delete(codeRoles).where(eq(codeRoles.roleId, roleId));
    if (holders.length > 0) {
      await tx
        .insert(codeRoles)
        .values(holders.map((codeId) => ({ codeId, roleId })));
    }
    return { outcome: "changed", role: { ...role, codeIds: holders } };
  });
}

/**
 * The roles a code holds, by id, in name order. The test code holds
 * every role, including ones made after it signed in.
 */
export async function rolesOf(
  db: Database | Transaction,
  code: { id: CodeId; code: string },
): Promise<RoleId[]> {
  const byName = asc(roles.name);
  const rows =
    code.code === testCode
      ? await db.select({ id: roles.id }).from(roles).orderBy(byName)
      : await db
          .select({ id: roles.id })
          .from(codeRoles)
          .innerJoin(roles, eq(codeRoles.roleId, roles.id))
          .where(eq(codeRoles.codeId, code.id))
          .orderBy(byName);
  return rows.map((row) => row.id);
}
