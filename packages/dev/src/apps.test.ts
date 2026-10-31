import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverApps, routesFor } from "./apps.ts";

async function installWith(
  apps: Record<string, Record<string, string> | null>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-apps-"));
  for (const [slug, scripts] of Object.entries(apps)) {
    await mkdir(join(root, "apps", slug), { recursive: true });
    if (scripts) {
      await writeFile(
        join(root, "apps", slug, "package.json"),
        JSON.stringify({ name: slug, scripts }),
      );
    }
  }
  return root;
}

describe("discoverApps", () => {
  it("finds each app folder with ports in slug order", async () => {
    const root = await installWith({
      notes: { dev: "vite" },
      core: { dev: "node main.ts", migrate: "node migrate.ts" },
      hub: { dev: "vite" },
      "not-an-app": null,
    });

    expect(await discoverApps(root)).toEqual([
      {
        slug: "core",
        dir: join(root, "apps", "core"),
        port: 3001,
        migrates: true,
      },
      {
        slug: "hub",
        dir: join(root, "apps", "hub"),
        port: 3002,
        migrates: false,
      },
      {
        slug: "notes",
        dir: join(root, "apps", "notes"),
        port: 3003,
        migrates: false,
      },
    ]);
  });

  it("numbers ports from the port it is given", async () => {
    const root = await installWith({ hub: { dev: "vite" } });

    const [hub] = await discoverApps(root, 4101);

    expect(hub?.port).toBe(4101);
  });

  it("finds nothing in an install without apps", async () => {
    const root = await mkdtemp(join(tmpdir(), "robkit-apps-"));

    expect(await discoverApps(root)).toEqual([]);
  });
});

describe("routesFor", () => {
  it("routes <slug>.<domain> to each app's port", () => {
    const routes = routesFor(
      [
        { slug: "core", dir: "/x/apps/core", port: 3001, migrates: true },
        { slug: "hub", dir: "/x/apps/hub", port: 3002, migrates: false },
      ],
      "robkit.test",
    );

    expect(routes).toEqual([
      { host: "core.robkit.test", app: "core", port: 3001 },
      { host: "hub.robkit.test", app: "hub", port: 3002 },
    ]);
  });
});
