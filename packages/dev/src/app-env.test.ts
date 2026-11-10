import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aDomain, slug } from "@internal/test-session";
import { appEnv, ownSettings, type InstallFacts } from "./app-env.ts";

const install: InstallFacts = {
  domain: aDomain(),
  coreUrl: "http://core.robkit.localhost:3000",
  catalog: "[]",
};

const notes = { slug: slug("notes"), port: 3004 };

describe("appEnv", () => {
  it("sets an app's slug, port, database and HOST, over whatever the shell has", () => {
    expect(
      appEnv(install, { HOST: "0.0.0.0", PATH: "/bin" }, notes, {
        databaseUrl: "postgres://notes",
      }),
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

describe("an app's own settings", () => {
  it("gives an app what its .env sets, under the shell's and the runner's", () => {
    const env = appEnv(install, { SHARED: "from the shell" }, notes, {
      own: {
        API_KEY: "from the file",
        SHARED: "from the file",
      },
    });

    expect(env).toMatchObject({
      API_KEY: "from the file",
      SHARED: "from the shell",
    });
  });

  it("reads apps/<slug>/.env, and leaves this process's environment as it was", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));
    await writeFile(join(dir, ".env"), "NOTES_TEST_SETTING=set\n");
    const before = { ...process.env };

    const own = await ownSettings(install, [{ ...notes, dir }]);

    expect(own.get(notes.slug)).toEqual({ NOTES_TEST_SETTING: "set" });
    expect(process.env).toEqual(before);
  });

  it("gives an app without a .env no settings of its own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));

    const own = await ownSettings(install, [{ ...notes, dir }]);

    expect(own.get(notes.slug)).toEqual({});
  });
});
