import { callCore, listOf, problem, type Result } from "@internal/core-client";
import {
  type InputProblem,
  isProblem,
  isRecord,
  readSlug,
  type Slug,
} from "@robkit/input";

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
      isRecord(body)
        ? listOf(body.apps, "apps", readLauncherApp)
        : problem("The launcher's answer isn't an object."),
  });
}

function readLauncherApp(value: unknown): LauncherApp | InputProblem {
  if (!isRecord(value)) return problem("It isn't an object.");
  const { name, icon = null } = value;
  const slug = readSlug(value.slug);
  if (isProblem(slug)) return problem("Its slug isn't a slug.");
  if (typeof name !== "string") return problem("Its name isn't text.");
  if (icon !== null && typeof icon !== "string") {
    return problem("Its icon isn't text or null.");
  }
  return { slug, name, icon };
}
