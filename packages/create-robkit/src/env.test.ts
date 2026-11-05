import { describe, expect, it } from "vitest";
import {
  readAffectedApps,
  readAppList,
  readCoolify,
  readDatabaseUrlsConfig,
} from "./env.ts";

const secret = "correct horse battery staple, 32+";
const adminUrl = "postgres://postgres:pw@db:5432/robkit";

describe("readDatabaseUrlsConfig", () => {
  it("reads the admin URL and the secret", () => {
    expect(
      readDatabaseUrlsConfig({
        ROBKIT_ADMIN_DATABASE_URL: adminUrl,
        ROBKIT_DB_SECRET: secret,
      }),
    ).toEqual({ adminUrl, secret });
  });

  it("names each variable that's missing", () => {
    expect(readDatabaseUrlsConfig({})).toEqual({
      error: [
        "ROBKIT_ADMIN_DATABASE_URL is not set. Set it to the host's Postgres admin URL.",
        "ROBKIT_DB_SECRET is not set. Set it to the install's database secret, at least 32 characters, such as the output of openssl rand -hex 32.",
      ].join("\n"),
    });
  });

  it("refuses a short secret", () => {
    expect(
      readDatabaseUrlsConfig({
        ROBKIT_ADMIN_DATABASE_URL: adminUrl,
        ROBKIT_DB_SECRET: "short",
      }),
    ).toEqual({
      error:
        "ROBKIT_DB_SECRET is too short. Set it to the install's database secret, at least 32 characters, such as the output of openssl rand -hex 32.",
    });
  });
});

describe("readCoolify", () => {
  it("reads nothing when COOLIFY_URL is unset", () => {
    expect(readCoolify({})).toBeUndefined();
    expect(readCoolify({ COOLIFY_URL: "" })).toBeUndefined();
  });

  it("reads Coolify's address and token, and an Access token when both halves are set", () => {
    expect(
      readCoolify({
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "t",
      }),
    ).toEqual({ url: "https://coolify.example", token: "t" });
    expect(
      readCoolify({
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "t",
        CF_ACCESS_CLIENT_ID: "id",
        CF_ACCESS_CLIENT_SECRET: "s",
      }),
    ).toEqual({
      url: "https://coolify.example",
      token: "t",
      accessId: "id",
      accessSecret: "s",
    });
  });

  it("needs a token to deploy", () => {
    expect(readCoolify({ COOLIFY_URL: "https://coolify.example" })).toEqual({
      error:
        "COOLIFY_TOKEN is not set. Set it to a Coolify API token to deploy.",
    });
  });

  it.each(["coolify.example", "ftp://coolify.example"])(
    "refuses the address %j",
    (url) => {
      expect(readCoolify({ COOLIFY_URL: url, COOLIFY_TOKEN: "t" })).toEqual({
        error: `COOLIFY_URL is "${url}", which isn't a web address. Set it to your Coolify's address, such as https://coolify.example.com.`,
      });
    },
  );

  it("refuses half an Access token", () => {
    expect(
      readCoolify({
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "t",
        CF_ACCESS_CLIENT_ID: "id",
      }),
    ).toEqual({
      error:
        "CF_ACCESS_CLIENT_SECRET is not set. Set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET when Cloudflare Access guards Coolify, or neither.",
    });
  });
});

describe("readAppList", () => {
  it("reads --apps as slugs", () => {
    expect(readAppList("core, notes")).toEqual(["core", "notes"]);
  });

  it("names a name that can't be a slug", () => {
    expect(readAppList("core,My-App")).toEqual({
      error: `--apps: "My-App" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });
});

describe("readAffectedApps", () => {
  it("reads the apps turbo found changed", () => {
    expect(
      readAffectedApps({
        packages: {
          items: [
            { name: "@internal/notes-app", path: "apps/notes" },
            { name: "@internal/ui", path: "packages/ui" },
          ],
        },
      }),
    ).toEqual(["notes"]);
    expect(readAffectedApps({ packages: { items: [] } })).toEqual([]);
  });

  it.each([null, {}, { packages: { items: [{ path: 1 }] } }])(
    "refuses %j",
    (value) => {
      expect(readAffectedApps(value)).toEqual({
        error:
          "turbo ls --affected printed JSON robkit can't read. Name the apps to deploy with --apps, or deploy them all with --all.",
      });
    },
  );
});
