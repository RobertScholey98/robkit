import { isProblem } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { readProvisionConfig } from "./env.ts";

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
    expect(isProblem(read) && read.error.split("\n")).toEqual([
      "ROBKIT_ADMIN_DATABASE_URL is not set. robkit deploy sets it on core from the host's shared variable of that name.",
      "ROBKIT_DB_SECRET is not set. robkit deploy sets it on core from the host's shared variable of that name.",
    ]);
  });
});
