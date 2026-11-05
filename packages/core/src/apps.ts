import {
  guard,
  readAccessRule,
  type AccessRule,
  type SessionState,
} from "@robkit/guard";
import {
  isProblem,
  parseJson,
  readDeclaredApp,
  type DeclaredAccess,
  type DeclaredApp,
  type Env,
  type Problem,
} from "@robkit/session/input";
import { asc, eq, inArray } from "drizzle-orm";
import { isUuid } from "./access-codes.ts";
import type { Database } from "./database.ts";
import { appRoles, apps, roles } from "./schema.ts";

/** An app as core lists it: its slug, name, icon and who may open it. */
export interface AppView {
  slug: string;
  name: string;
  icon: string | null;
  access: AccessRule;
}

export type AccessChange =
  | { outcome: "changed"; access: AccessRule }
  | { outcome: "unknown-app" }
  | { outcome: "unknown-role" };

/** The rule the owner sent for an app, or why it won't do. */
export function readAccess(
  fields: Record<string, unknown>,
): AccessRule | { error: string } {
  const rule = readAccessRule(fields);
  if (rule && !(rule.kind === "roles" && rule.roles.length === 0)) return rule;
  return fields.kind === "roles"
    ? { error: "Pick at least one role." }
    : { error: "Pick open, roles or owner." };
}

/**
 * Reads `ROBKIT_APPS`: a JSON list of the install's apps as they declare
 * themselves, which the dev runner and robkit deploy write from each app's
 * manifest. Empty or unset means none.
 */
export function readDeclaredApps(env: Env): DeclaredApp[] | Problem {
  const text = env.ROBKIT_APPS;
  if (text === undefined || text.trim() === "") return [];
  const parsed = parseJson(text, "ROBKIT_APPS");
  if (isProblem(parsed)) return parsed;
  const { json } = parsed;
  if (!Array.isArray(json)) {
    return {
      error: `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.`,
    };
  }
  const apps: DeclaredApp[] = [];
  for (const [index, value] of json.entries()) {
    const app = readDeclaredApp(value, `ROBKIT_APPS[${String(index)}]`);
    if (isProblem(app)) return app;
    apps.push(app);
  }
  return apps;
}

/**
 * Adds each app core doesn't know yet, named after its slug, with the rule
 * it declares, or owner-only. A rule's roles are found by name, and created
 * if the owner has none of that name. An app core knows keeps the rule the
 * owner gave it, and takes the icon it declares now.
 */
const owner: DeclaredAccess = { kind: "owner" };

export async function registerApps(
  db: Database,
  declared: readonly DeclaredApp[],
): Promise<void> {
  if (declared.length === 0) return;
  await db.transaction(async (tx) => {
    const known = new Set(
      (
        await tx
          .select({ slug: apps.slug })
          .from(apps)
          .where(
            inArray(
              apps.slug,
              declared.map((app) => app.slug),
            ),
          )
      ).map((row) => row.slug),
    );
    for (const { slug, access = owner, icon } of declared) {
      if (known.has(slug)) {
        await tx
          .update(apps)
          .set({ icon: icon ?? null })
          .where(eq(apps.slug, slug));
        continue;
      }
      await tx
        .insert(apps)
        .values({ slug, name: slug, access: access.kind, icon: icon ?? null });
      if (access.kind !== "roles") continue;
      for (const name of new Set(access.roleNames)) {
        await tx
          .insert(roles)
          .values({ name })
          .onConflictDoNothing({ target: roles.name });
        const [role] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, name));
        if (role) {
          await tx.insert(appRoles).values({ appSlug: slug, roleId: role.id });
        }
      }
    }
  });
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
  return rows.map(({ slug, name, icon, access }) => ({
    slug,
    name,
    icon,
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

/** An app as the launcher lists it. */
export interface LauncherApp {
  slug: string;
  name: string;
  icon: string | null;
}

/**
 * The apps the launcher lists for a session: exactly those the guard lets
 * it open, so the launcher never lists an app that would answer 404.
 */
export async function launcherApps(
  db: Database,
  session: SessionState,
): Promise<LauncherApp[]> {
  return (await listApps(db))
    .filter((app) => guard(app.access, session).outcome === "allow")
    .map(({ slug, name, icon }) => ({ slug, name, icon }));
}
