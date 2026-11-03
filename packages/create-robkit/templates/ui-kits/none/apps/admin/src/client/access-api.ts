import { readAccessRule, type AccessRule } from "@robkit/guard";
import { callCore, isRecord, listOf, type Result } from "@internal/core-client";

export type { AccessRule };

/** A role, and the codes that hold it, by id. */
export interface Role {
  id: string;
  name: string;
  codeIds: string[];
}

/** An app in core's catalog, and who may open it. */
export interface App {
  slug: string;
  name: string;
  access: AccessRule;
}

export function listRoles(core: string): Promise<Result<Role[]>> {
  return callCore(core, "GET", "/roles", {
    read: (body) => (isRecord(body) ? listOf(body.roles, readRole) : undefined),
  });
}

export function createRole(
  core: string,
  role: { name: string; codeIds: string[] },
): Promise<Result<Role>> {
  return callCore(core, "POST", "/roles", { body: role, read: readRole });
}

/** Makes exactly these codes hold the role. */
export function setRoleCodes(
  core: string,
  roleId: string,
  codeIds: string[],
): Promise<Result<Role>> {
  const path = `/roles/${encodeURIComponent(roleId)}/codes`;
  return callCore(core, "POST", path, { body: { codeIds }, read: readRole });
}

export function listApps(core: string): Promise<Result<App[]>> {
  return callCore(core, "GET", "/apps", {
    read: (body) => (isRecord(body) ? listOf(body.apps, readApp) : undefined),
  });
}

export function setAccess(
  core: string,
  slug: string,
  access: AccessRule,
): Promise<Result<AccessRule>> {
  const path = `/apps/${encodeURIComponent(slug)}/access`;
  return callCore(core, "POST", path, { body: access, read: readAccessRule });
}

function readRole(body: unknown): Role | undefined {
  if (!isRecord(body)) return undefined;
  const { id, name, codeIds } = body;
  const ids = listOf(codeIds, (id) =>
    typeof id === "string" ? id : undefined,
  );
  return typeof id === "string" && typeof name === "string" && ids
    ? { id, name, codeIds: ids }
    : undefined;
}

function readApp(body: unknown): App | undefined {
  if (!isRecord(body)) return undefined;
  const { slug, name } = body;
  const access = readAccessRule(body.access);
  return typeof slug === "string" && typeof name === "string" && access
    ? { slug, name, access }
    : undefined;
}
