import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addApp } from "./add.ts";
import { defaultChoices } from "./choices.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import { init } from "./init.ts";

/** The default install, plus `brochure` on react-hono, open to anyone. */
async function install(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir);
  await addApp(dir, {
    slug: "brochure",
    stack: "react-hono",
    access: { kind: "open" },
    icon: "📰",
  });
  return dir;
}

describe("deploymentOf", () => {
  it("gives every app its address and slug, and each database app its URL from the host", async () => {
    const apps = await deploymentOf(await install(), { domain: "robkit.dev" });

    const common = {
      ROBKIT_DOMAIN: { literal: "robkit.dev" },
      ROBKIT_CORE_URL: { literal: "https://core.robkit.dev" },
      PORT: { literal: "3000" },
    };
    expect(apps).toEqual([
      {
        slug: "admin",
        env: { ROBKIT_APP: { literal: "admin" }, ...common },
      },
      {
        slug: "brochure",
        env: {
          ROBKIT_APP: { literal: "brochure" },
          ...common,
          DATABASE_URL: { shared: "BROCHURE_DATABASE_URL" },
        },
      },
      {
        slug: "core",
        env: {
          ROBKIT_APP: { literal: "core" },
          ...common,
          DATABASE_URL: { shared: "CORE_DATABASE_URL" },
          ROBKIT_APPS: {
            literal: JSON.stringify([
              { slug: "brochure", access: { kind: "open" }, icon: "📰" },
              { slug: "example" },
            ]),
          },
          ROBKIT_DATABASES: { literal: "brochure,core,example" },
          ROBKIT_ADMIN_DATABASE_URL: { shared: "ROBKIT_ADMIN_DATABASE_URL" },
          ROBKIT_DB_SECRET: { shared: "ROBKIT_DB_SECRET" },
        },
      },
      {
        slug: "example",
        env: {
          ROBKIT_APP: { literal: "example" },
          ...common,
          DATABASE_URL: { shared: "EXAMPLE_DATABASE_URL" },
        },
      },
      {
        slug: "hub",
        env: { ROBKIT_APP: { literal: "hub" }, ...common },
      },
    ]);
  });

  it("puts a public port in core's URL when the install has one", async () => {
    const [admin] = await deploymentOf(await install(), {
      domain: "robkit.test",
      port: 8443,
    });

    expect(admin?.env.ROBKIT_CORE_URL).toEqual({
      literal: "https://core.robkit.test:8443",
    });
  });
});

describe("databaseUrls", () => {
  it("names each database app's URL on the host, its password derived from the secret", async () => {
    const urls = await databaseUrls(await install(), {
      adminUrl: "postgres://postgres:pw@db.internal:5432/robkit",
      secret: "correct horse battery staple, 32+",
    });

    expect([...urls.keys()]).toEqual([
      "BROCHURE_DATABASE_URL",
      "CORE_DATABASE_URL",
      "EXAMPLE_DATABASE_URL",
    ]);
    expect(urls.get("CORE_DATABASE_URL")).toMatch(
      /^postgres:\/\/core:[0-9a-f]{64}@db\.internal:5432\/robkit$/,
    );
  });
});
