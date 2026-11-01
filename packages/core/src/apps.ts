import type { AccessRule } from "@robkit/guard";
import { asc, eq, inArray } from "drizzle-orm";
import { isUuid } from "./access-codes.ts";
import type { Database } from "./database.ts";
import { appRoles, apps, roles } from "./schema.ts";

/** An app as core lists it: its slug, name and who may open it. */
export interface AppView {
  slug: string;
  name: string;
  access: AccessRule;
}

export type AccessChange =
  | { outcome: "changed"; access: AccessRule }
  | { outcome: "unknown-app" }
  | { outcome: "unknown-role" };

/**
 * Adds each app core doesn't know yet, as owner-only and named after its
 * slug. An app core knows keeps the rule the owner gave it.
 */
export async function registerApps(
  db: Database,
  slugs: readonly string[],
): Promise<void> {
  if (slugs.length === 0) return;
  await db
    .insert(apps)
    .values(slugs.map((slug) => ({ slug, name: slug })))
    .onConflictDoNothing({ target: apps.slug });
}

/** Every app core knows, by slug, with its rule. */
export async function listApps(db: Database): Promise<AppView[]> {
  const [rows, gates] = await Promise.all([
    db.select().from(apps).orderBy(asc(apps.slug)),
    db
      .select({ appSlug: appRoles.appSlug, roleId: appRoles.roleId })
      .from(appRoles)
      .innerJoin(roles, eq(appRoles.roleId, roles.id))
      .orderBy(asc(roles.name)),
  ]);
  return rows.map(({ slug, name, access }) => ({
    slug,
    name,
    access: ruleOf(
      access,
      gates.filter((gate) => gate.appSlug === slug).map((gate) => gate.roleId),
    ),
  }));
}

function ruleOf(
  kind: (typeof apps.$inferSelect)["access"],
  roleIds: string[],
): AccessRule {
  return kind === "roles" ? { kind, roles: roleIds } : { kind };
}

/** Who may open the app, or undefined if core doesn't know it. */
export async function accessOf(
  db: Database,
  slug: string,
): Promise<AccessRule | undefined> {
  return (await listApps(db)).find((app) => app.slug === slug)?.access;
}

/** Sets who may open the app. A rule's roles must all exist. */
export async function setAccess(
  db: Database,
  slug: string,
  rule: AccessRule,
): Promise<AccessChange> {
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({ slug: apps.slug })
      .from(apps)
      .where(eq(apps.slug, slug))
      .for("update");
    if (!app) return { outcome: "unknown-app" };
    const roleIds = rule.kind === "roles" ? [...new Set(rule.roles)] : [];
    if (!roleIds.every(isUuid)) return { outcome: "unknown-role" };
    const found =
      roleIds.length === 0
        ? []
        : await tx
            .select({ id: roles.id })
            .from(roles)
            .where(inArray(roles.id, roleIds))
            .orderBy(asc(roles.name));
    if (found.length !== roleIds.length) return { outcome: "unknown-role" };

    await tx.update(apps).set({ access: rule.kind }).where(eq(apps.slug, slug));
    await tx.delete(appRoles).where(eq(appRoles.appSlug, slug));
    if (found.length > 0) {
      await tx
        .insert(appRoles)
        .values(found.map(({ id }) => ({ appSlug: slug, roleId: id })));
    }
    return {
      outcome: "changed",
      access: ruleOf(
        rule.kind,
        found.map(({ id }) => id),
      ),
    };
  });
}
