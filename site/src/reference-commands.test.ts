// The reference pages for npm create robkit and the robkit command, held
// to each command's usage text, so a command or an option added to one and
// not the other fails here. Each example of output a test can make offline
// is made here too, and held to the page.

import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultChoices,
  init,
  readyStacks,
  robkitCommands,
} from "create-robkit";
import { beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { built, codeBlocks } from "./test/built.ts";

const bin = (name: string) =>
  join(repoRoot, "packages", "create-robkit", "src", name);

/** Runs one of create-robkit's commands in `cwd`, as an owner would. */
const run = (
  file: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) =>
  spawnSync(process.execPath, [bin(file), ...args], {
    cwd,
    env,
    encoding: "utf8",
  });

/** Each `## <title>` section of a built page, by its title. */
function sections(html: string): Map<string, string> {
  return new Map(
    html
      .split(/<h2 id="[^"]+">/)
      .slice(1)
      .map((section) => [
        (/^([^<]+)<\/h2>/.exec(section)?.[1] ?? "").trim(),
        section,
      ]),
  );
}

/** The options a section lists, as each item that starts with one names it. */
const optionsIn = (section: string) =>
  [...section.matchAll(/<li><code>(--[a-z-]+)/g)].map(([, flag]) => flag);

/** The stacks a page lists for `--stack`, as one "one of" list. */
const stackList = () =>
  `${readyStacks
    .slice(0, -1)
    .map((stack) => `<code>${stack}</code>`)
    .join(", ")} or <code>${String(readyStacks.at(-1))}</code>`;

describe("the reference page for the robkit command", () => {
  const page = "docs/reference/robkit-command/index.html";
  let install: string;

  beforeAll(async () => {
    install = join(await mkdtemp(join(tmpdir(), "site-commands-")), "install");
    await init(defaultChoices, install, { install: false });
  }, 60_000);

  /** Each command the usage text names, with the options it gives it. */
  const usage = () => {
    const printed = run("robkit-command.ts", ["nope"], install).stderr;
    return new Map(
      [...printed.matchAll(/^Usage: robkit (\S+)(.*)$/gm)].map(
        ([, command = "", rest = ""]) => [
          command,
          rest.match(/--[a-z-]+/g) ?? [],
        ],
      ),
    );
  };

  it("has a section for each command the usage text names, and no other", async () => {
    const commands = usage();

    expect([...commands.keys()].sort()).toEqual([...robkitCommands].sort());
    expect(
      [...sections(await built(page)).keys()].filter((title) =>
        title.startsWith("robkit "),
      ),
    ).toEqual([...commands.keys()].map((command) => `robkit ${command}`));
  });

  it("lists each command's options as its usage text gives them, and no other", async () => {
    const pageSections = sections(await built(page));

    for (const [command, options] of usage()) {
      expect({
        command,
        options: optionsIn(pageSections.get(`robkit ${command}`) ?? ""),
      }).toEqual({ command, options });
    }
    expect(usage().get("deploy")).toEqual(["--all", "--apps", "--dry-run"]);
  });

  it("gives add's stacks as robkit makes them", async () => {
    expect(sections(await built(page)).get("robkit add")).toContain(
      `one of ${stackList()}.`,
    );
  });

  /** The page's "What it prints" block that starts with `start`. */
  const example = async (start: string) =>
    codeBlocks(await built(page)).find(
      ({ label, code }) => label === "What it prints" && code.startsWith(start),
    )?.code;

  it("shows what robkit check prints", async () => {
    await writeFile(
      join(install, "apps/example/src/core.ts"),
      'import { createCore } from "@robkit/core";\n',
    );
    const checked = run("robkit-command.ts", ["check"], install);

    expect(checked.status).toBe(1);
    expect(await example("apps/example/src/core.ts")).toBe(
      checked.stdout.trimEnd(),
    );
  }, 60_000);

  it("shows what robkit database-urls prints, with the password left out", async () => {
    const printed = run("robkit-command.ts", ["database-urls"], install, {
      ...process.env,
      ROBKIT_ADMIN_DATABASE_URL:
        "postgres://postgres:admin@db.example.com:5432/postgres",
      ROBKIT_DB_SECRET: "a".repeat(64),
    });

    expect(printed.status).toBe(0);
    expect(await example("CORE_DATABASE_URL=")).toBe(
      printed.stdout
        .trimEnd()
        .replaceAll(
          /(\/\/[a-z0-9]+:)[^@]+@/g,
          "$1<the password robkit derives>@",
        ),
    );
  });

  it("shows what robkit deploy prints with no COOLIFY_URL", async () => {
    const env = { ...process.env };
    delete env.COOLIFY_URL;
    const printed = run("robkit-command.ts", ["deploy"], install, env);

    expect(printed.status).toBe(0);
    expect(await example("COOLIFY_URL")).toBe(printed.stdout.trimEnd());
  });
});

describe("the reference page for npm create robkit", () => {
  const page = "docs/reference/npm-create-robkit/index.html";

  it("lists the options its usage text gives, and no other", async () => {
    const dir = await mkdtemp(join(tmpdir(), "site-create-"));
    const printed = run("create-robkit-command.ts", ["one", "two"], dir).stderr;
    const options = [...printed.matchAll(/^ {2}(--[a-z-]+)/gm)].map(
      ([, flag]) => flag,
    );

    expect(printed).toMatch(/^Usage: npm create robkit /m);
    expect(options).toEqual(["--stack", "--no-install", "--link"]);
    expect(optionsIn(sections(await built(page)).get("Options") ?? "")).toEqual(
      options,
    );
  });

  it("gives the stacks robkit makes", async () => {
    expect(sections(await built(page)).get("Options")).toContain(
      `one of ${stackList()}.`,
    );
  });
});
