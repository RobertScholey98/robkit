import { describe, expect, it } from "vitest";
import { aDomain, slug } from "@internal/test-session";
import { appSettings, shellForApps, type InstallFacts } from "./app-env.ts";

const install: InstallFacts = {
  domain: aDomain(),
  coreUrl: "http://core.robkit.localhost:3000",
  catalog: "[]",
};

describe("appSettings", () => {
  it("sets an app's slug, port, database and HOST, over whatever the shell has", () => {
    const env = {
      ...shellForApps({ HOST: "0.0.0.0", PATH: "/bin" }),
      ...appSettings(
        install,
        { slug: slug("notes"), port: 3004 },
        "postgres://notes",
      ),
    };

    expect(env).toEqual({
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
    const env = {
      ...shellForApps({
        DATABASE_URL: "postgres://elsewhere",
        ROBKIT_DATABASE_URL: "postgres://admin",
        VITEST: "true",
      }),
      ...appSettings(install, { slug: slug("notes"), port: 3004 }),
    };

    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(env).not.toHaveProperty("ROBKIT_DATABASE_URL");
    expect(env).not.toHaveProperty("VITEST");
  });
});
