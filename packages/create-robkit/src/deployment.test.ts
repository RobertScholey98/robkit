import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it } from "vitest";
import { addApp } from "./add.ts";
import { defaultChoices } from "./choices.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import { init } from "./init.ts";
import { slug, aDomain } from "@internal/test-session";

/** The default install, plus `brochure` on react-hono, open to anyone. */
async function makeInstall(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir, { install: false });
  await addApp(dir, {
    slug: slug("brochure"),
    stack: "react-hono",
    access: { kind: "open" },
    icon: "📰",
  });
  return dir;
}

let made: Promise<string> | undefined;

/** The install, made on first use and shared, since every test only reads it. */
function install(): Promise<string> {
  made ??= makeInstall();
  return made;
}

describe("deploymentOf", () => {
  it("gives every app its address and slug, and each database app its URL from the host", async () => {
    const apps = await deploymentOf(await install(), {
      domain: aDomain("robkit.dev"),
    });

    const address = {
      ROBKIT_CORE_URL: { literal: "https://core.robkit.dev" },
      PORT: { literal: "3000" },
    };
    // Core reads only ROBKIT_CORE_URL, so only the other apps get the domain.
    const common = { ROBKIT_DOMAIN: { literal: "robkit.dev" }, ...address };
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
          ...address,
          DATABASE_URL: { shared: "CORE_DATABASE_URL" },
          ROBKIT_APPS: {
            literal: JSON.stringify([
              { slug: "brochure", access: { kind: "open" }, icon: "📰" },
              { slug: "example", icon: "📦" },
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

  it("tells only core to trust Cloudflare when the install sits behind it", async () => {
    const apps = await deploymentOf(await install(), {
      domain: aDomain("robkit.dev"),
      trustedProxy: "cloudflare",
    });

    expect(
      apps.map(({ slug, env }) => [slug, env.ROBKIT_TRUSTED_PROXY]),
    ).toEqual([
      ["admin", undefined],
      ["brochure", undefined],
      ["core", { literal: "cloudflare" }],
      ["example", undefined],
      ["hub", undefined],
    ]);
  });

  it("puts a public port in core's URL when the install has one", async () => {
    const [admin] = await deploymentOf(await install(), {
      domain: aDomain("robkit.test"),
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

  it("refuses a secret too short to derive passwords from", async () => {
    await expect(
      databaseUrls(await install(), {
        adminUrl: "postgres://postgres:pw@db.internal:5432/robkit",
        secret: "short",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "robkit database-urls can't derive brochure's password. The database secret is 5 characters. It must be at least 32. Set ROBKIT_DB_SECRET to the install's secret.",
      ),
    );
  });
});
