import { callCore, isRecord, listOf, type Result } from "@internal/core-client";
import { isProblem, readSlug, type Slug } from "@robkit/input";

/** An app the launcher lists: core lists only those the viewer may open. */
export interface LauncherApp {
  slug: Slug;
  name: string;
  /** An emoji, if the app's manifest declares one. */
  icon: string | null;
}

export function listLauncherApps(core: string): Promise<Result<LauncherApp[]>> {
  return callCore(core, "GET", "/launcher", {
    read: (body) =>
      isRecord(body) ? listOf(body.apps, readLauncherApp) : undefined,
  });
}

function readLauncherApp(value: unknown): LauncherApp | undefined {
  if (!isRecord(value)) return undefined;
  const { name, icon = null } = value;
  const slug = readSlug(value.slug);
  return !isProblem(slug) &&
    typeof name === "string" &&
    (icon === null || typeof icon === "string")
    ? { slug, name, icon }
    : undefined;
}
