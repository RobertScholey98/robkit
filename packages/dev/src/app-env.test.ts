import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aDomain, slug } from "@internal/test-session";
import { CommandProblem } from "@robkit/input/command";
import {
  appEnv,
  ownSettings,
  refusedAppSettings,
  type InstallFacts,
} from "./app-env.ts";

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

    const own = await ownSettings([{ ...notes, dir }]);

    expect(own.get(notes.slug)).toEqual({ NOTES_TEST_SETTING: "set" });
    expect(process.env).toEqual(before);
  });

  it("gives an app without a .env no settings of its own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));

    const own = await ownSettings([{ ...notes, dir }]);

    expect(own.get(notes.slug)).toEqual({});
  });
});

describe("what an app's .env can't set", () => {
  async function appWith(
    file: string,
  ): Promise<typeof notes & { dir: string }> {
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));
    await writeFile(join(dir, ".env"), file);
    return { ...notes, dir };
  }

  it.each([
    "DATABASE_URL",
    "PORT",
    "HOST",
    "VITEST",
    "ROBKIT_APP",
    "ROBKIT_CORE_URL",
  ])("refuses %s, which pnpm dev decides for each app", async (name) => {
    const app = await appWith(`${name}=mine\n`);

    await expect(ownSettings([app])).rejects.toEqual(
      new CommandProblem(
        `apps/notes/.env sets ${name}, which pnpm dev decides for each app. Remove it from the file.`,
      ),
    );
  });

  it.each(["ROBKIT_DEV_PORT", "ROBKIT_SOMETHING_LATER"])(
    "refuses %s, since every ROBKIT_ name is robkit's",
    async (name) => {
      const app = await appWith(`${name}=mine\n`);

      await expect(ownSettings([app])).rejects.toEqual(
        new CommandProblem(
          `apps/notes/.env sets ${name}, and a name that starts ROBKIT_ is robkit's own. Remove it from the file. robkit's settings for pnpm dev go in the .env at the install's root.`,
        ),
      );
    },
  );

  it("refuses NODE_ENV, which decides whether a test helper serves", async () => {
    const app = await appWith("NODE_ENV=test\n");

    await expect(ownSettings([app])).rejects.toEqual(
      new CommandProblem(
        "apps/notes/.env sets NODE_ENV, which decides whether a test helper such as guardedAs() serves. Remove it from the file.",
      ),
    );
  });

  it("names every refused variable in every file, each as a problem", async () => {
    const notesApp = await appWith("PORT=1\nAPI_KEY=fine\nHOST=0.0.0.0\n");
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));
    await writeFile(join(dir, ".env"), "NODE_ENV=test\n");
    const ledger = { slug: slug("ledger"), port: 3005, dir };

    const refused = await ownSettings([notesApp, ledger]).catch(
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(AggregateError);
    const problems = (refused as AggregateError).errors;
    expect(
      problems.map((problem: CommandProblem) => problem.message).sort(),
    ).toEqual([
      expect.stringMatching(/^apps\/ledger\/\.env sets NODE_ENV,/),
      expect.stringMatching(/^apps\/notes\/\.env sets HOST,/),
      expect.stringMatching(/^apps\/notes\/\.env sets PORT,/),
    ]);
    for (const problem of problems) {
      expect(problem).toBeInstanceOf(CommandProblem);
    }
  });
});

describe("Next's telemetry", () => {
  it("is off unless the shell or the app's .env says otherwise", () => {
    const off = appEnv(install, {}, notes);
    const fromShell = appEnv(install, { NEXT_TELEMETRY_DISABLED: "0" }, notes);
    const fromFile = appEnv(install, {}, notes, {
      own: { NEXT_TELEMETRY_DISABLED: "0" },
    });

    expect([
      off.NEXT_TELEMETRY_DISABLED,
      fromShell.NEXT_TELEMETRY_DISABLED,
      fromFile.NEXT_TELEMETRY_DISABLED,
    ]).toEqual(["1", "0", "0"]);
  });

  it("may be set in an app's .env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));
    await writeFile(join(dir, ".env"), "NEXT_TELEMETRY_DISABLED=0\n");

    const own = await ownSettings([{ ...notes, dir }]);

    expect(own.get(notes.slug)).toEqual({ NEXT_TELEMETRY_DISABLED: "0" });
  });
});

describe("refusedAppSettings", () => {
  it("names what an app's .env can't set", () => {
    expect(refusedAppSettings).toEqual({
      decidedForEachApp: [
        "ROBKIT_DOMAIN",
        "ROBKIT_CORE_URL",
        "ROBKIT_APPS",
        "ROBKIT_APP",
        "PORT",
        "HOST",
        "DATABASE_URL",
        "ROBKIT_DATABASE_URL",
        "VITEST",
      ],
      prefix: "ROBKIT_",
      alsoRefused: ["NODE_ENV"],
    });
  });

  it("holds each name ownSettings refuses", async () => {
    const names = [
      ...refusedAppSettings.decidedForEachApp,
      `${refusedAppSettings.prefix}SOMETHING_LATER`,
      ...refusedAppSettings.alsoRefused,
    ];
    const dir = await mkdtemp(join(tmpdir(), "robkit-app-env-"));
    await writeFile(
      join(dir, ".env"),
      names.map((name) => `${name}=mine\n`).join(""),
    );

    const refused = await ownSettings([{ ...notes, dir }]).catch(
      (error: unknown) => error,
    );

    expect(
      (refused as AggregateError).errors.map(
        (problem: CommandProblem) => /sets (\w+),/.exec(problem.message)?.[1],
      ),
    ).toEqual(names.toSorted());
  });
});
