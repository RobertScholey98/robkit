import { readAccessRule, type AccessRule } from "@robkit/guard";
import { call, isRecord, post, readWith, type Result } from "./core-call.ts";

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

export async function listRoles(core: string): Promise<Result<Role[]>> {
  return readWith(await call(core, "/roles", { method: "GET" }), (body) =>
    isRecord(body) ? listOf(body.roles, readRole) : undefined,
  );
}

export async function createRole(
  core: string,
  role: { name: string; codeIds: string[] },
): Promise<Result<Role>> {
  return readWith(await call(core, "/roles", post(role)), readRole);
}

/** Makes exactly these codes hold the role. */
export async function setRoleCodes(
  core: string,
  roleId: string,
  codeIds: string[],
): Promise<Result<Role>> {
  const path = `/roles/${encodeURIComponent(roleId)}/codes`;
  return readWith(await call(core, path, post({ codeIds })), readRole);
}

export async function listApps(core: string): Promise<Result<App[]>> {
  return readWith(await call(core, "/apps", { method: "GET" }), (body) =>
    isRecord(body) ? listOf(body.apps, readApp) : undefined,
  );
}

export async function setAccess(
  core: string,
  slug: string,
  access: AccessRule,
): Promise<Result<AccessRule>> {
  const path = `/apps/${encodeURIComponent(slug)}/access`;
  return readWith(await call(core, path, post(access)), readAccessRule);
}

function listOf<T>(
  value: unknown,
  read: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(read);
  return items.every((item) => item !== undefined) ? items : undefined;
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
