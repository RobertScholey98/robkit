import { describe, expect, it } from "vitest";
import { aDomain, slug } from "@internal/test-session";
import { appEnv, type InstallFacts } from "./app-env.ts";

const install: InstallFacts = {
  domain: aDomain(),
  coreUrl: "http://core.robkit.localhost:3000",
  catalog: "[]",
};

const notes = { slug: slug("notes"), port: 3004 };

describe("appEnv", () => {
  it("sets an app's slug, port, database and HOST, over whatever the shell has", () => {
    expect(
      appEnv(
        install,
        { HOST: "0.0.0.0", PATH: "/bin" },
        notes,
        "postgres://notes",
      ),
    ).toEqual({
      PATH: "/bin",
      ROBKIT_DOMAIN: "robkit.localhost",
      ROBKIT_CORE_URL: "http://core.robkit.localhost:3000",
      ROBKIT_APPS: "[]",
      HOST: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      ROBKIT_APP: "notes",
      PORT: "3004",
      DATABASE_URL: "postgres://notes",
    });
  });

  it("gives an app without a database no DATABASE_URL, even one the shell has", () => {
    const env = appEnv(
      install,
      {
        DATABASE_URL: "postgres://elsewhere",
        ROBKIT_DATABASE_URL: "postgres://admin",
        VITEST: "true",
      },
      notes,
    );

    expect(Object.keys(env)).not.toContain("DATABASE_URL");
    expect(Object.keys(env)).not.toContain("ROBKIT_DATABASE_URL");
    expect(Object.keys(env)).not.toContain("VITEST");
  });
});
