import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { reportFaultsAt, runCommand } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { defaultChoices, type Choices } from "./choices.ts";
import { appFiles } from "./generate.ts";
import { init } from "./init.ts";
import { drive, keys, questionsAsked } from "./test/drive.ts";
import { pathWith } from "./test/path.ts";

const bin = fileURLToPath(new URL("robkit-command.ts", import.meta.url));

/** A written install, without its dependencies, so add installs nothing. */
async function freshInstall(choices: Choices = defaultChoices) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(choices, dir, { install: false });
  return dir;
}

let readOnly: Promise<string> | undefined;

/**
 * One install, made on first use, for the tests that only read it. A test
 * that adds an app or writes a file makes its own with freshInstall.
 */
function readOnlyInstall(): Promise<string> {
  readOnly ??= freshInstall();
  return readOnly;
}

async function declared(dir: string, slug: string): Promise<unknown> {
  const manifest = JSON.parse(
    await readFile(join(dir, "apps", slug, "package.json"), "utf8"),
  ) as { robkit?: unknown };
  return manifest.robkit;
}

describe("robkit add with flags", () => {
  it("adds the app without asking anything", async () => {
    const dir = await freshInstall();

    const { code, output } = await drive(bin, dir, [
      "add",
      "notes",
      "--stack",
      "react-hono",
      "--access",
      "roles",
      "--roles",
      "Family, Cooks",
      "--icon",
      "📝",
    ]);

    expect({ code, output }).toEqual({
      code: 0,
      output: `Added apps/notes. Next:

  pnpm install
  pnpm dev

Then open http://notes.robkit.localhost:3000.
`,
    });
    expect(await declared(dir, "notes")).toEqual({
      access: { kind: "roles", roles: ["Family", "Cooks"] },
      icon: "📝",
    });
  });

  it("takes the first stack, owner only and the default icon for flags left out", async () => {
    const dir = await freshInstall();

    const { code } = await drive(bin, dir, ["add", "notes", "--icon", "🗒️"]);

    expect(code).toBe(0);
    expect(await declared(dir, "notes")).toEqual({
      access: { kind: "owner" },
      icon: "🗒️",
    });
    expect(
      await readFile(join(dir, "apps/notes/src/home.tsx"), "utf8"),
    ).toContain("Signed in as");
  });

  it.each([
    [["add", "--access", "open"], "Usage: robkit add [name]"],
    [
      ["add", "notes", "--access", "everyone"],
      "--access everyone isn't an option. Choose from: owner, open, roles.",
    ],
    [
      ["add", "notes", "--access", "roles"],
      "--access roles needs --roles, naming at least one.",
    ],
    [
      ["add", "notes", "--roles", "Family"],
      "--roles only goes with --access roles.",
    ],
    [
      ["add", "my_notes", "--access", "open"],
      `"my_notes" can't be an app's slug`,
    ],
    [["remove", "notes"], "Usage: robkit add [name]"],
  ])("refuses %j", async (args, message) => {
    const dir = await readOnlyInstall();

    const { code, output } = await drive(bin, dir, args);

    expect(code).toBe(1);
    expect(output).toContain(message);
  });

  it("refuses to run outside an install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await drive(bin, dir, [
      "add",
      "notes",
      "--access",
      "open",
    ]);

    expect({ code, output }).toEqual({
      code: 1,
      output: `${dir} isn't a robkit install: it has no robkit.json. Run robkit in an install's folder.\n`,
    });
  });
});

describe("robkit add with an icon that isn't one emoji", () => {
  it("fails with the manifest's message and writes nothing", async () => {
    const dir = await freshInstall();

    const { code, output } = await drive(bin, dir, [
      "add",
      "notes",
      "--icon",
      "memo",
    ]);

    expect({ code, output }).toEqual({
      code: 1,
      output: 'robkit.icon must be one emoji, such as "📝".\n',
    });
    expect(await readdir(join(dir, "apps"))).not.toContain("notes");
  });
});

describe("robkit add in an install with its dependencies", () => {
  it("names the folder and the command to finish with when pnpm install fails", async () => {
    const dir = await freshInstall();
    await mkdir(join(dir, "node_modules"));
    const env = await pathWith({
      pnpm: { line: "11.28.9", failsOn: "install" },
    });

    const { code, output } = await drive(
      bin,
      dir,
      ["add", "notes", "--stack", "react-hono"],
      [],
      env,
    );

    expect(code).toBe(1);
    expect(output).toContain(
      `pnpm install failed in ${dir}, so apps/notes has its files but the install doesn't have its dependencies. Its output is above. Fix what it says, then run pnpm install in ${dir} to finish.
`,
    );
    expect(
      await readFile(join(dir, "apps/notes/package.json"), "utf8"),
    ).toContain("@internal/notes-app");
  });
});

describe("robkit outside an install", () => {
  it.each([[[]], [["check"]], [["deploy"]], [["vendor", "--nope"]]])(
    "prints one line saying so for %j",
    async (args) => {
      const dir = await mkdtemp(join(tmpdir(), "robkit-"));

      const { code, output } = await drive(bin, dir, args);

      expect({ code, output }).toEqual({
        code: 1,
        output: `${dir} isn't a robkit install: it has no robkit.json. Run robkit in an install's folder.\n`,
      });
    },
  );
});

describe("robkit's failures", () => {
  it.each([["check"], ["add"]])(
    "refuses an option %s doesn't take, printing why and the usage, not a bug",
    async (command) => {
      const dir = await readOnlyInstall();

      const { code, output } = await drive(bin, dir, [command, "--nope"]);

      expect(code).toBe(1);
      expect(output).toMatch(/^--nope isn't an option\.\n\nUsage: robkit add/);
      expect(output).toContain("Usage: robkit check");
      expect(output).not.toContain(reportFaultsAt);
    },
  );

  it("prints a fault it didn't expect whole, with where to report it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await mkdir(join(dir, "robkit.json"));

    const { code, output } = await drive(bin, dir, ["check"]);

    expect(code).toBe(1);
    expect(output).toContain("EISDIR");
    expect(output).toMatch(/^ {4}at /m);
    expect(output).toContain(reportFaultsAt);
  });

  it.each([
    [
      "isn't JSON",
      "{ nope",
      /^robkit\/templates\/start\/package\.json isn't valid JSON \(.+\)\. Fix its syntax\.\n$/,
    ],
    [
      "isn't an object",
      "[]",
      /^robkit\/templates\/start\/package\.json must be a JSON object\. Fix it, or delete robkit\/templates\/start to use robkit's template\.\n$/,
    ],
  ])(
    "prints a template override whose package.json %s as a problem, naming it",
    async (_, manifest, message) => {
      const dir = await freshInstall();
      await mkdir(join(dir, "robkit/templates/start"), { recursive: true });
      await writeFile(
        join(dir, "robkit/templates/start/package.json"),
        manifest,
      );

      const { code, output } = await drive(bin, dir, [
        "add",
        "notes",
        "--stack",
        "start",
      ]);

      expect(code).toBe(1);
      expect(output).toMatch(message);
    },
  );

  it("prints a template override with no package.json as a problem", async () => {
    const dir = await freshInstall();
    await mkdir(join(dir, "robkit/templates/start/src"), { recursive: true });
    await writeFile(join(dir, "robkit/templates/start/src/main.ts"), "");

    const { code, output } = await drive(bin, dir, [
      "add",
      "notes",
      "--stack",
      "start",
    ]);

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "robkit/templates/start has no package.json. Add one, or delete the folder to use robkit's template.\n",
    });
  });

  it("prints a robkit.json that isn't JSON as a problem, naming it", async () => {
    const dir = await freshInstall();
    await writeFile(join(dir, "robkit.json"), "{ nope");

    const { code, output } = await drive(bin, dir, ["add", "notes"]);

    expect(code).toBe(1);
    expect(output).toMatch(
      /^robkit\.json isn't valid JSON \(.+\)\. Fix its syntax\.\n$/,
    );
  });

  it("prints a malformed file robkit ships as a fault", async () => {
    const printed: unknown[][] = [];

    const code = await runCommand(
      () => {
        appFiles(new Map([["package.json", "{ nope"]]), "notes");
        return Promise.resolve(0);
      },
      (...line) => printed.push(line),
    );

    expect(code).toBe(1);
    expect(printed.flat().join("\n")).toContain(reportFaultsAt);
  });
});

describe("robkit add with no flags", () => {
  it("asks for the stack, name, access, roles and icon, then prints the command that skips them", async () => {
    const dir = await freshInstall();

    const { code, output } = await drive(
      bin,
      dir,
      ["add"],
      [
        ["Which stack?", keys.down + keys.enter],
        ["What's the app called?", `recipes${keys.enter}`],
        ["Who can open it?", keys.down + keys.down + keys.enter],
        ["Which roles?", `Family${keys.enter}`],
        ["Which emoji should the launcher show?", `🍳${keys.enter}`],
      ],
    );

    expect(code).toBe(0);
    expect(questionsAsked(output)).toEqual([
      "Which stack?",
      "What's the app called?",
      "Who can open it?",
      "Which roles? Separate them with commas.",
      "Which emoji should the launcher show?",
    ]);
    expect(output).toContain(
      'pnpm robkit add recipes --stack react-hono --access roles --roles "Family" --icon 🍳',
    );
    expect(await declared(dir, "recipes")).toEqual({
      access: { kind: "roles", roles: ["Family"] },
      icon: "🍳",
    });
  });

  it("refuses a name that's taken before asking anything", async () => {
    const dir = await readOnlyInstall();

    const { code, output } = await drive(bin, dir, ["add", "example"]);

    expect({ code, output }).toEqual({
      code: 1,
      output: "apps/example already exists. Choose another name.\n",
    });
  });
});

describe("robkit database-urls", () => {
  it("prints each database app's URL for the host, from the admin URL and secret", async () => {
    const dir = await readOnlyInstall();

    const { code, output } = await drive(bin, dir, ["database-urls"], [], {
      ROBKIT_ADMIN_DATABASE_URL: "postgres://postgres:pw@db:5432/robkit",
      ROBKIT_DB_SECRET: "correct horse battery staple, 32+",
    });

    expect(code).toBe(0);
    expect(output.split("\n").map((line) => line.split("=")[0])).toEqual([
      "CORE_DATABASE_URL",
      "EXAMPLE_DATABASE_URL",
      "",
    ]);
  });

  it("says what to set when the admin URL or secret is missing", async () => {
    const dir = await readOnlyInstall();

    const { code, output } = await drive(bin, dir, ["database-urls"], [], {
      ROBKIT_ADMIN_DATABASE_URL: "",
      ROBKIT_DB_SECRET: "",
    });

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "ROBKIT_ADMIN_DATABASE_URL is not set. Set it to the host's Postgres admin URL.\nROBKIT_DB_SECRET is not set. Set it to the install's database secret, at least 32 characters, such as the output of openssl rand -hex 32.\n",
    });
  });
});

describe("robkit deploy", () => {
  const coolifyJson = JSON.stringify({
    project: "robkit",
    environment: "production",
    server: "localhost",
    githubApp: "robkit-coolify",
    repository: "RobertScholey98/robkit-dev",
    branch: "main",
    domain: "robkit.dev",
  });

  it("says how to set up an install with no coolify.json", async () => {
    const dir = await readOnlyInstall();

    const { code, output } = await drive(bin, dir, ["deploy"], [], {
      COOLIFY_URL: "https://coolify.example",
      COOLIFY_TOKEN: "t",
    });

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "This install has no coolify.json. See docs/deploy.md to set one up.\n",
    });
  });

  it.each([
    ["{", /^coolify\.json isn't valid JSON \(.+\)\. Fix its syntax\.\n$/],
    ["null", /^coolify\.json must be a JSON object with project/],
  ])("names coolify.json when it holds %s", async (text, message) => {
    const dir = await freshInstall();
    await writeFile(join(dir, "coolify.json"), text);

    const { code, output } = await drive(bin, dir, ["deploy", "--dry-run"]);

    expect(code).toBe(1);
    expect(output).toMatch(message);
  });

  it("prints each app's variables on a dry run", async () => {
    const dir = await freshInstall();
    await writeFile(join(dir, "coolify.json"), coolifyJson);

    const { code, output } = await drive(bin, dir, ["deploy", "--dry-run"]);

    expect(code).toBe(0);
    expect(output).toContain(`example:
  ROBKIT_APP=example
  ROBKIT_DOMAIN=robkit.dev
  ROBKIT_CORE_URL=https://core.robkit.dev
  PORT=3000
  DATABASE_URL=(shared) EXAMPLE_DATABASE_URL
`);
  });

  // The stand-in turbo is a shell script, which Windows can't run.
  it.skipIf(process.platform === "win32")(
    "prints turbo's own message when turbo ls fails",
    async () => {
      const dir = await freshInstall();
      await writeFile(join(dir, "coolify.json"), coolifyJson);
      const standIn = await mkdtemp(join(tmpdir(), "turbo-stand-in-"));
      await writeFile(
        join(standIn, "turbo"),
        "#!/bin/sh\necho '  x No git repository found' >&2\nexit 1\n",
        { mode: 0o755 },
      );

      const { code, output } = await drive(bin, dir, ["deploy"], [], {
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "t",
        PATH: `${standIn}:${String(process.env.PATH)}`,
      });

      expect({ code, output }).toEqual({
        code: 1,
        output:
          "turbo ls --affected couldn't find the apps that changed: x No git repository found. Name the apps to deploy with --apps, or deploy them all with --all.\n",
      });
    },
  );

  it("deploys nothing until COOLIFY_URL is set", async () => {
    const dir = await freshInstall();
    await writeFile(join(dir, "coolify.json"), coolifyJson);

    const { code, output } = await drive(bin, dir, ["deploy"], [], {
      COOLIFY_URL: "",
    });

    expect({ code, output }).toEqual({
      code: 0,
      output: "COOLIFY_URL is not set, so nothing was deployed.\n",
    });
  });
});
