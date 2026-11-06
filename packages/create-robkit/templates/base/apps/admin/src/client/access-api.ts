import {
  readAccessRule,
  readRoleId,
  type AccessRule,
  type RoleId,
} from "@robkit/guard";
import { callCore, listOf, problem, type Result } from "@internal/core-client";
import { type InputProblem, isProblem, isRecord } from "@robkit/input";

export type { AccessRule, RoleId };

/** A role, and the codes that hold it, by id. */
export interface Role {
  id: RoleId;
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
    read: (body) =>
      isRecord(body)
        ? listOf(body.roles, "roles", readRole)
        : problem("The roles' answer isn't an object."),
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
    read: (body) =>
      isRecord(body)
        ? listOf(body.apps, "apps", readApp)
        : problem("The apps' answer isn't an object."),
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

function readRole(body: unknown): Role | InputProblem {
  if (!isRecord(body)) return problem("The role isn't an object.");
  const id = readRoleId(body.id);
  if (isProblem(id)) return id;
  const { name } = body;
  if (typeof name !== "string") return problem("The role's name isn't text.");
  const codeIds = listOf(body.codeIds, "codeIds", (codeId) =>
    typeof codeId === "string" ? codeId : problem("It isn't text."),
  );
  if (isProblem(codeIds)) return codeIds;
  return { id, name, codeIds };
}

function readApp(body: unknown): App | InputProblem {
  if (!isRecord(body)) return problem("The app isn't an object.");
  const { slug, name } = body;
  if (typeof slug !== "string") return problem("The app's slug isn't text.");
  if (typeof name !== "string") return problem("The app's name isn't text.");
  const access = readAccessRule(body.access);
  if (isProblem(access)) return access;
  return { slug, name, access };
}
