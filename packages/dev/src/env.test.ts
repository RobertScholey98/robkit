import { describe, expect, it } from "vitest";
import { readDevConfig, readProvisionConfig } from "./env.ts";

describe("readDevConfig", () => {
  it("runs on robkit.localhost:3000 with Compose's Postgres by default", () => {
    expect(readDevConfig({})).toEqual({
      domain: "robkit.localhost",
      devPort: 3000,
      adminUrl: "postgres://postgres:postgres@127.0.0.1:54320/robkit",
    });
  });

  it("reads each setting", () => {
    expect(
      readDevConfig({
        ROBKIT_DOMAIN: "dev.example.com",
        ROBKIT_DEV_PORT: "4000",
        ROBKIT_POSTGRES_PORT: "5433",
      }),
    ).toEqual({
      domain: "dev.example.com",
      devPort: 4000,
      adminUrl: "postgres://postgres:postgres@127.0.0.1:5433/robkit",
    });
    expect(
      readDevConfig({ ROBKIT_DATABASE_URL: "postgres://a:b@db:5432/x" }),
    ).toMatchObject({ adminUrl: "postgres://a:b@db:5432/x" });
  });

  it("names every variable that won't do", () => {
    const read = readDevConfig({
      ROBKIT_DOMAIN: "http://robkit.localhost",
      ROBKIT_DEV_PORT: "0",
      ROBKIT_POSTGRES_PORT: "x",
      ROBKIT_DATABASE_URL: "mysql://db",
    });
    expect("error" in read && read.error.split("\n")).toEqual([
      "ROBKIT_DOMAIN is \"http://robkit.localhost\", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.",
      'ROBKIT_DEV_PORT is "0", which isn\'t a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.',
      "ROBKIT_DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.",
      'ROBKIT_POSTGRES_PORT is "x", which isn\'t a port. Set it to a whole number from 1 to 65535, or leave it unset for 54320.',
    ]);
  });
});

describe("readProvisionConfig", () => {
  const ready = {
    ROBKIT_DATABASES: "notes, example",
    ROBKIT_ADMIN_DATABASE_URL: "postgres://postgres:pw@db:5432/robkit",
    ROBKIT_DB_SECRET: "correct horse battery staple, 32+",
  };

  it("reads the apps to provision, the admin URL and the secret", () => {
    expect(readProvisionConfig(ready)).toEqual({
      adminUrl: ready.ROBKIT_ADMIN_DATABASE_URL,
      secret: ready.ROBKIT_DB_SECRET,
      slugs: ["notes", "example"],
    });
    expect(readProvisionConfig({ ...ready, ROBKIT_DATABASES: "" })).toEqual({
      adminUrl: ready.ROBKIT_ADMIN_DATABASE_URL,
      secret: ready.ROBKIT_DB_SECRET,
      slugs: [],
    });
  });

  it("names a slug that won't do", () => {
    expect(
      readProvisionConfig({ ...ready, ROBKIT_DATABASES: "notes,drop table" }),
    ).toEqual({
      error: `ROBKIT_DATABASES: "drop table" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });

  it("names every variable that won't do", () => {
    const read = readProvisionConfig({ ROBKIT_DATABASES: "notes" });
    expect("error" in read && read.error.split("\n")).toEqual([
      "ROBKIT_ADMIN_DATABASE_URL is not set. robkit deploy sets it on core from the host's shared variable of that name.",
      "ROBKIT_DB_SECRET is not set. robkit deploy sets it on core from the host's shared variable of that name.",
    ]);
  });
});
