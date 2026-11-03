/** An app the launcher lists: core lists only those the viewer may open. */
export interface LauncherApp {
  slug: string;
  name: string;
}

export type LauncherResult =
  { ok: true; apps: LauncherApp[] } | { ok: false; error: string };

export async function listLauncherApps(core: string): Promise<LauncherResult> {
  let res: Response;
  try {
    res = await fetch(`${core}/launcher`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    return { ok: false, error: `Couldn't reach core at ${core}.` };
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const error =
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : `Core answered ${String(res.status)}.`;
    return { ok: false, error };
  }
  const apps = isRecord(body) ? body.apps : undefined;
  if (!Array.isArray(apps) || !apps.every(isLauncherApp)) {
    return { ok: false, error: "Core sent apps the hub can't read." };
  }
  return { ok: true, apps };
}

function isLauncherApp(value: unknown): value is LauncherApp {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.name === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
