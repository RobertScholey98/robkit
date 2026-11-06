import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogOf,
  discoverApps,
  readAppManifestFile,
  routesFor,
} from "./apps.ts";
import { slug, aDomain } from "@internal/test-session";

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
        manifest: {},
      },
      {
        slug: "hub",
        dir: join(root, "apps", "hub"),
        port: 3002,
        migrates: false,
        manifest: {},
      },
      {
        slug: "notes",
        dir: join(root, "apps", "notes"),
        port: 3003,
        migrates: false,
        manifest: {},
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

  it("refuses an app whose package.json isn't JSON, naming it", async () => {
    const root = await installWith({ hub: { dev: "vite" } });
    await writeFile(join(root, "apps", "hub", "package.json"), "{ nope");

    await expect(discoverApps(root)).rejects.toThrow(
      /^apps\/hub\/package\.json isn't valid JSON \(.+\)\. Fix its syntax\.$/,
    );
  });

  it("refuses an app whose manifest declares a rule core can't read", async () => {
    const root = await installWith({ hub: { dev: "vite" } });
    await writeFile(
      join(root, "apps", "hub", "package.json"),
      JSON.stringify({ robkit: { access: "everyone" } }),
    );

    await expect(discoverApps(root)).rejects.toThrow(
      /^apps\/hub\/package\.json: robkit\.access must be/,
    );
  });

  it("ignores a folder without a package.json, whatever its name", async () => {
    const root = await installWith({ hub: { dev: "vite" }, ".cache": null });

    expect((await discoverApps(root)).map((app) => app.slug)).toEqual(["hub"]);
  });

  it("finds nothing in an install without apps", async () => {
    const root = await mkdtemp(join(tmpdir(), "robkit-apps-"));

    expect(await discoverApps(root)).toEqual([]);
  });
});

describe("readAppManifestFile", () => {
  const file = "apps/notes/package.json";

  it("reads the scripts and what the app declares", () => {
    expect(
      readAppManifestFile(
        {
          name: "@internal/notes-app",
          scripts: { dev: "vite", migrate: "drizzle-kit migrate" },
          robkit: { access: { kind: "roles", roles: ["Family"] }, icon: "📝" },
        },
        file,
      ),
    ).toEqual({
      name: "@internal/notes-app",
      scripts: { dev: "vite", migrate: "drizzle-kit migrate" },
      manifest: {
        access: { kind: "roles", roleNames: ["Family"] },
        icon: "📝",
      },
    });
    expect(readAppManifestFile({}, file)).toEqual({
      scripts: {},
      manifest: {},
    });
  });

  it.each([null, [], "notes"])("refuses %j", (value) => {
    expect(readAppManifestFile(value, file)).toEqual({
      error: "apps/notes/package.json must be a JSON object, as npm expects.",
    });
  });

  it.each([
    [
      { name: 1 },
      `apps/notes/package.json: name must be a string, such as "@internal/notes-app".`,
    ],
    [
      { scripts: null },
      "apps/notes/package.json: scripts must be an object of script names to commands.",
    ],
    [
      { scripts: { migrate: true } },
      "apps/notes/package.json: scripts must be an object of script names to commands.",
    ],
    [
      { robkit: { access: { kind: "everyone" } } },
      `apps/notes/package.json: robkit.access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.`,
    ],
    [
      { robkit: { icon: 7 } },
      `apps/notes/package.json: robkit.icon must be one emoji, such as "📝".`,
    ],
  ])("refuses %j", (value, error) => {
    expect(readAppManifestFile(value, file)).toEqual({ error });
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
          manifest: {},
        },
        {
          slug: "hub",
          dir: "/x/apps/hub",
          port: 3002,
          migrates: false,
          manifest: {},
        },
      ],
      aDomain("robkit.test"),
    );

    expect(routes).toEqual([
      { host: "core.robkit.test", app: "core", port: 3001 },
      { host: "hub.robkit.test", app: "hub", port: 3002 },
    ]);
  });
});

describe("catalogOf", () => {
  const app = (name: string, manifest = {}) => ({
    slug: slug(name),
    dir: `/x/apps/${name}`,
    port: 3001,
    migrates: false,
    manifest,
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
        catalogOf([
          app("notes", {
            access: { kind: "roles", roleNames: ["Family"] },
            icon: "📝",
          }),
        ]),
      ),
    ).toEqual([
      {
        slug: "notes",
        access: { kind: "roles", roles: ["Family"] },
        icon: "📝",
      },
    ]);
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

    expect(notes?.manifest).toEqual({
      access: { kind: "roles", roleNames: ["Family"] },
      icon: "📝",
    });
  });
});
