import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { drive, keys, questionsAsked } from "./test/drive.ts";

const bin = fileURLToPath(new URL("robkit.ts", import.meta.url));

/** A written install, without its dependencies, so add installs nothing. */
async function freshInstall(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir);
  return dir;
}

async function declared(dir: string, slug: string): Promise<unknown> {
  const manifest = JSON.parse(
    await readFile(join(dir, "apps", slug, "package.json"), "utf8"),
  ) as { robkit?: unknown };
  return manifest.robkit;
}

describe("robkit add with flags", { timeout: 30_000 }, () => {
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
      await readFile(join(dir, "apps/notes/src/routes/index.tsx"), "utf8"),
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
    const dir = await freshInstall();

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
      output: `${dir} has no robkit.json. Run robkit add in an install's folder.\n`,
    });
  });
});

describe("robkit add with no flags", { timeout: 30_000 }, () => {
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
    const dir = await freshInstall();

    const { code, output } = await drive(bin, dir, ["add", "example"]);

    expect({ code, output }).toEqual({
      code: 1,
      output: "apps/example already exists. Choose another name.\n",
    });
  });
});

describe("robkit database-urls", { timeout: 30_000 }, () => {
  it("prints each database app's URL for the host, from the admin URL and secret", async () => {
    const dir = await freshInstall();

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
    const dir = await freshInstall();

    const { code, output } = await drive(bin, dir, ["database-urls"], [], {
      ROBKIT_ADMIN_DATABASE_URL: "",
      ROBKIT_DB_SECRET: "",
    });

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "Set ROBKIT_ADMIN_DATABASE_URL to the host's Postgres admin URL and ROBKIT_DB_SECRET to the install's database secret.\n",
    });
  });
});

describe("robkit deploy", { timeout: 30_000 }, () => {
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
    const dir = await freshInstall();

    const { code, output } = await drive(bin, dir, ["deploy"]);

    expect({ code, output }).toEqual({
      code: 1,
      output:
        "This install has no coolify.json. See docs/deploy.md to set one up.\n",
    });
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
