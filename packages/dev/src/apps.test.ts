import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogOf, discoverApps, routesFor } from "./apps.ts";

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
        seeds: false,
        declares: {},
      },
      {
        slug: "hub",
        dir: join(root, "apps", "hub"),
        port: 3002,
        migrates: false,
        seeds: false,
        declares: {},
      },
      {
        slug: "notes",
        dir: join(root, "apps", "notes"),
        port: 3003,
        migrates: false,
        seeds: false,
        declares: {},
      },
    ]);
  });

  it("numbers ports from the port it is given", async () => {
    const root = await installWith({ hub: { dev: "vite" } });

    const [hub] = await discoverApps(root, 4101);

    expect(hub?.port).toBe(4101);
  });

  it("refuses an app folder whose name can't be a slug", async () => {
    const root = await installWith({
      hub: { dev: "vite" },
      "my-app": { dev: "vite" },
    });

    await expect(discoverApps(root)).rejects.toThrow(
      `apps/my-app: "my-app" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    );
  });

  it("ignores a folder without a package.json, whatever its name", async () => {
    const root = await installWith({ hub: { dev: "vite" }, ".cache": null });

    expect((await discoverApps(root)).map((app) => app.slug)).toEqual(["hub"]);
  });

  it("finds the seed at the app's root, seed.sql", async () => {
    const root = await installWith({
      guestbook: { migrate: "node migrate.js" },
      notes: { migrate: "node migrate.js" },
    });
    await writeFile(join(root, "apps", "guestbook", "seed.sql"), "select 1;");

    const apps = await discoverApps(root);

    expect(apps.map(({ slug, seeds }) => ({ slug, seeds }))).toEqual([
      { slug: "guestbook", seeds: true },
      { slug: "notes", seeds: false },
    ]);
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
        {
          slug: "core",
          dir: "/x/apps/core",
          port: 3001,
          migrates: true,
          seeds: false,
          declares: {},
        },
        {
          slug: "hub",
          dir: "/x/apps/hub",
          port: 3002,
          migrates: false,
          seeds: false,
          declares: {},
        },
      ],
      "robkit.test",
    );

    expect(routes).toEqual([
      { host: "core.robkit.test", app: "core", port: 3001 },
      { host: "hub.robkit.test", app: "hub", port: 3002 },
    ]);
  });
});

describe("catalogOf", () => {
  const app = (slug: string, declares = {}) => ({
    slug,
    dir: `/x/apps/${slug}`,
    port: 3001,
    migrates: false,
    seeds: false,
    declares,
  });

  it("lists the owner's apps for core's catalog, leaving out the platform apps", () => {
    expect(
      JSON.parse(
        catalogOf(
          ["admin", "core", "example", "hub", "notes"].map((s) => app(s)),
        ),
      ),
    ).toEqual([{ slug: "example" }, { slug: "notes" }]);
  });

  it("passes on what each app's manifest declares", () => {
    expect(
      JSON.parse(
        catalogOf([app("notes", { access: { kind: "open" }, icon: "📝" })]),
      ),
    ).toEqual([{ slug: "notes", access: { kind: "open" }, icon: "📝" }]);
  });
});

describe("discoverApps reading a manifest's robkit field", () => {
  it("keeps what the app declares for core", async () => {
    const root = await mkdtemp(join(tmpdir(), "robkit-apps-"));
    await mkdir(join(root, "apps", "notes"), { recursive: true });
    await writeFile(
      join(root, "apps", "notes", "package.json"),
      JSON.stringify({
        name: "notes",
        robkit: { access: { kind: "roles", roles: ["Family"] }, icon: "📝" },
      }),
    );

    const [notes] = await discoverApps(root);

    expect(notes?.declares).toEqual({
      access: { kind: "roles", roles: ["Family"] },
      icon: "📝",
    });
  });
});
