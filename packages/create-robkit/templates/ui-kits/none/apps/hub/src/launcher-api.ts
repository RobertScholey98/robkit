import { callCore, isRecord, listOf, type Result } from "@internal/core-client";

/** An app the launcher lists: core lists only those the viewer may open. */
export interface LauncherApp {
  slug: string;
  name: string;
}

export function listLauncherApps(core: string): Promise<Result<LauncherApp[]>> {
  return callCore(core, "GET", "/launcher", {
    read: (body) =>
      isRecord(body) ? listOf(body.apps, readLauncherApp) : undefined,
  });
}

function readLauncherApp(value: unknown): LauncherApp | undefined {
  if (!isRecord(value)) return undefined;
  const { slug, name } = value;
  return typeof slug === "string" && typeof name === "string"
    ? { slug, name }
    : undefined;
}
