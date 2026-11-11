import {
  guard,
  readAccessRule,
  type AccessRule,
  type RoleId,
  type SessionState,
} from "@robkit/guard";
import {
  type Env,
  type InputProblem,
  isProblem,
  parseJson,
  problem,
  type Slug,
} from "@robkit/input";
import {
  type ManifestAccess,
  type ListedApp,
  readListedApp,
} from "@robkit/input/manifest";
import { asc, eq, inArray, notInArray } from "drizzle-orm";
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
): AccessRule | InputProblem {
  const rule = readAccessRule(fields);
  if (!isProblem(rule) && !(rule.kind === "roles" && rule.roles.length === 0)) {
    return rule;
  }
  return fields.kind === "roles"
    ? problem("Pick at least one role.")
    : problem("Pick open, roles or owner.");
}

/**
 * Reads `ROBKIT_APPS`: a JSON list of the install's apps as they declare
 * themselves, which the dev runner and robkit deploy write from each app's
 * manifest. `[]` means none. Unset or blank is a problem, not an empty
 * list, since core takes out of its catalog every app the list leaves out.
 */
export function readListedApps(env: Env): ListedApp[] | InputProblem {
  const text = env.ROBKIT_APPS;
  if (text === undefined || text.trim() === "") {
    return problem(
      "ROBKIT_APPS is not set. pnpm dev and robkit deploy set it from each app's manifest. Set it to [] for an install with no apps of its own.",
    );
  }
  const parsed = parseJson(text, "ROBKIT_APPS");
  if (isProblem(parsed)) return parsed;
  const { json } = parsed;
  if (!Array.isArray(json)) {
    return problem(
      `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.`,
    );
  }
  const apps: ListedApp[] = [];
  for (const [index, value] of json.entries()) {
    const app = readListedApp(value, `ROBKIT_APPS[${String(index)}]`);
    if (isProblem(app)) return app;
    apps.push(app);
  }
  return apps;
}

/**
 * Makes core's catalog hold exactly the apps `declared` lists, as core
 * does once as it starts. An app it no longer lists is deleted, and its
 * rule's links to roles go with it; the roles stay. An app it lists that
 * core doesn't know is added, named after its slug, with the rule it
 * declares, or owner-only. A rule's roles are found by name, and created
 * if the owner has none of that name. So a slug that comes back is a new
 * app. An app core knows keeps the rule the owner gave it, and takes the
 * icon it declares now.
 */
const owner: ManifestAccess = { kind: "owner" };

export async function registerApps(
  db: Database,
  declared: readonly ListedApp[],
): Promise<void> {
  const slugs = declared.map((app) => app.slug);
  await db.transaction(async (tx) => {
    await tx
      .delete(apps)
      .where(slugs.length === 0 ? undefined : notInArray(apps.slug, slugs));
    const known = new Set(
      (await tx.select({ slug: apps.slug }).from(apps)).map((row) => row.slug),
    );
    for (const { slug, access = owner, icon } of declared) {
      if (known.has(slug)) {
        await tx
          .update(apps)
          .set({ icon: icon ?? null })
          .where(eq(apps.slug, slug));
        continue;
      }
      // Another core starting at the same moment may have just added it.
      // Then this insert does nothing and returns no row, and that core
      // adds the rule's roles, so this one leaves them alone.
      const [added] = await tx
        .insert(apps)
        .values({ slug, name: slug, access: access.kind, icon: icon ?? null })
        .onConflictDoNothing({ target: apps.slug })
        .returning({ slug: apps.slug });
      if (!added || access.kind !== "roles") continue;
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
  roleIds: RoleId[],
): AccessRule {
  return kind === "roles" ? { kind, roles: roleIds } : { kind };
}

/** Who may open the app, or undefined if core doesn't know it. */
export async function accessOf(
  db: Database,
  slug: Slug,
): Promise<AccessRule | undefined> {
  const rows = await db
    .select({ access: apps.access, roleId: appRoles.roleId })
    .from(apps)
    .leftJoin(appRoles, eq(appRoles.appSlug, apps.slug))
    .leftJoin(roles, eq(appRoles.roleId, roles.id))
    .where(eq(apps.slug, slug))
    .orderBy(asc(roles.name));
  const [app] = rows;
  if (!app) return undefined;
  return ruleOf(
    app.access,
    rows.flatMap(({ roleId }) => (roleId === null ? [] : [roleId])),
  );
}

/** Sets who may open the app. A rule's roles must all exist. */
export async function setAccess(
  db: Database,
  slug: Slug,
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
