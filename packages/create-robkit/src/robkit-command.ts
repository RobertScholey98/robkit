#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { askDev, CommandProblem, isMissing, runCommand } from "@robkit/dev/cli";
import { isProblem, parseJson, readSlug } from "@robkit/input";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
} from "@robkit/input/addresses";
import { addApp, readInstallChoices } from "./add.ts";
import { gitHistory, pushedTo } from "./affected-apps.ts";
import { readArgs } from "./args.ts";
import {
  addCommandFor,
  addUsage,
  appChoicesFromFlags,
  askAdd,
} from "./add-wizard.ts";
import { readCoolifyConfig } from "./coolify-config.ts";
import { afterAdd, afterMigrate } from "./dev-answers.ts";
import { deploy } from "./coolify-deploy.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import { readAppList, readCoolify, readDatabaseUrlsConfig } from "./env.ts";
import { readRobkitRepo } from "./robkit-repo.ts";
import { isRobkitCommand, type RobkitCommand } from "./robkit-commands.ts";
import { finishInstall, installDependencies } from "./set-up.ts";
import { finishUpgrade, upgrade } from "./upgrade.ts";
import { vendorDir, vendorPackages } from "./vendor.ts";

/** Where an install's apps answer under pnpm dev. */
const dev = addresses({ domain: defaultDomain, port: defaultDevPort });

const migrateUsage = `Usage: robkit migrate <slug>

Asks the pnpm dev running in this install to run the app's migrate script,
with the database URL it gave the app, so a new migration applies without
a restart.`;

const upgradeUsage = `Usage: robkit upgrade [version]

Moves the install to a newer robkit: the newest, or the version given. It
updates the catalog, the lint policy in tooling/eslint and the Go module in
vendor/robkit/go, and never your apps. It needs every change committed and
pnpm dev stopped.

In an install that runs the tarballs robkit vendor packed, it moves to the
registry's copy of this robkit instead, then removes the tarballs.`;

const usage = `${addUsage}

${migrateUsage}

${upgradeUsage}

Usage: robkit check

Checks that every app in the install keeps to the layer rule, and names
each place one breaks it.

Usage: robkit vendor [--from <checkout>]

In an install made with --link, packs the robkit packages it links to into
${vendorDir} and points the install at them, so it builds without the
checkout. With --from, it packs them from that robkit checkout, which is how
an install that has vendored takes a newer robkit.

Usage: robkit database-urls

Prints the DATABASE_URL of each app with a database, as KEY=value lines to
set once as shared variables on the host. Reads the host's Postgres admin
URL from ROBKIT_ADMIN_DATABASE_URL and the install's database secret from
ROBKIT_DB_SECRET.

Usage: robkit deploy [--all | --apps <list>] [--dry-run]

Brings the install's applications on Coolify in line with the install, as
coolify.json describes it, then deploys, core first, each app that is new,
changed since the commit its last finished deploy recorded, or getting new
variables. Runs only from a commit pushed to the branch coolify.json names,
since that is what Coolify builds. Reads COOLIFY_URL and COOLIFY_TOKEN. With
--dry-run, reads Coolify, writes nothing to it, and prints what each app
would do and why. Without COOLIFY_URL, --dry-run prints each app's variables
instead.`;

process.exitCode = await runCommand(async () => {
  requireInstall(process.cwd());
  const [command] = process.argv.slice(2);
  const commands = {
    add,
    check,
    migrate: migrateApp,
    upgrade: upgradeInstall,
    vendor,
    "database-urls": printDatabaseUrls,
    deploy: deployInstall,
  } satisfies Record<RobkitCommand, () => Promise<number | undefined>>;
  // add() answers anything else with the usage text.
  return (
    command !== undefined && isRobkitCommand(command) ? commands[command] : add
  )();
});

/** Refuses a folder with no `robkit.json` in one line, whatever the command. */
function requireInstall(root: string): void {
  if (!existsSync(join(root, "robkit.json"))) {
    throw new CommandProblem(
      `${root} isn't a robkit install: it has no robkit.json. Run robkit in an install's folder.`,
    );
  }
}

async function check(): Promise<number> {
  const { positionals } = readArgs({ allowPositionals: true }, usage);
  if (positionals.length > 1) throw new CommandProblem(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  // check.ts loads TypeScript, a third of a second, so only check loads it.
  const { checkInstall, describeViolation } = await import("./check.ts");
  const violations = await checkInstall(root);
  for (const violation of violations) console.log(describeViolation(violation));
  return violations.length > 0 ? 1 : 0;
}

async function vendor(): Promise<undefined> {
  const { values, positionals } = readArgs(
    { allowPositionals: true, options: { from: { type: "string" } } },
    usage,
  );
  if (positionals.length > 1) throw new CommandProblem(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  await vendorPackages(root, { from: values.from });
  if (existsSync(join(root, "node_modules"))) {
    await installDependencies(root);
  }
  console.log(
    `Packed robkit's packages into ${vendorDir}. Commit it with the install.`,
  );
}

async function printDatabaseUrls(): Promise<undefined> {
  const { positionals } = readArgs({ allowPositionals: true }, usage);
  if (positionals.length > 1) throw new CommandProblem(usage);
  const root = process.cwd();
  await readInstallChoices(root);
  const config = readDatabaseUrlsConfig(process.env);
  if (isProblem(config)) throw new CommandProblem(config.error);
  for (const [name, url] of await databaseUrls(root, config)) {
    console.log(`${name}=${url}`);
  }
}

async function deployInstall(): Promise<number | undefined> {
  const { values, positionals } = readArgs(
    {
      allowPositionals: true,
      options: {
        all: { type: "boolean", default: false },
        apps: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    },
    usage,
  );
  if (positionals.length > 1) throw new CommandProblem(usage);
  const root = process.cwd();
  await readInstallChoices(root);
  const dryRun = values["dry-run"];
  const coolify = readCoolify(process.env);
  if (isProblem(coolify)) throw new CommandProblem(coolify.error);
  // An install's CI deploys from its first push, before Coolify is set up.
  if (!coolify && !dryRun) {
    console.log("COOLIFY_URL is not set, so nothing was deployed.");
    return;
  }
  const configPath = join(root, "coolify.json");
  if (!existsSync(configPath)) {
    throw new CommandProblem(
      "This install has no coolify.json. See docs/deploy.md to set one up.",
    );
  }
  const parsed = parseJson(await readFile(configPath, "utf8"), "coolify.json");
  const config = isProblem(parsed) ? parsed : readCoolifyConfig(parsed.json);
  if (isProblem(config)) throw new CommandProblem(config.error);
  const deployments = await deploymentOf(root, {
    domain: config.domain,
    trustedProxy: config.trustedProxy,
  });

  if (!coolify) {
    for (const { slug, env } of deployments) {
      console.log(`${slug}:`);
      for (const [key, value] of Object.entries(env)) {
        const shown =
          "literal" in value ? value.literal : `(shared) ${value.shared}`;
        console.log(`  ${key}=${shown}`);
      }
    }
    console.log(
      "Set COOLIFY_URL and COOLIFY_TOKEN to see which apps would deploy and why: the reasons need the host.",
    );
    return;
  }
  const apps = values.all
    ? "all"
    : values.apps === undefined
      ? "changed"
      : readAppList(values.apps);
  if (isProblem(apps)) throw new CommandProblem(apps.error);
  const history = await gitHistory(root);
  if (!(await pushedTo(root, config))) {
    const { branch, repository } = config;
    throw new CommandProblem(
      `Coolify builds ${branch} as ${repository} holds it, not this checkout, so robkit deploy runs only from a commit pushed there. This checkout's commit, ${history.head.slice(0, 7)}, isn't on ${branch} at a remote for ${repository}. Push it, or fetch if it's pushed already, then deploy again. A remote counts when its URL ends in ${repository}.`,
    );
  }
  const ok = await deploy({
    coolify,
    config,
    deployments,
    apps,
    history,
    dryRun,
  });
  return ok ? 0 : 1;
}

async function add(): Promise<undefined> {
  const { values, positionals } = readArgs(
    {
      allowPositionals: true,
      options: {
        stack: { type: "string" },
        access: { type: "string" },
        roles: { type: "string" },
        icon: { type: "string" },
      },
    },
    usage,
  );
  const [command, given, ...rest] = positionals;
  if (command !== "add" || rest.length > 0) throw new CommandProblem(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const asked = Object.keys(values).length === 0;
  const choices = asked
    ? await askAdd(root, given)
    : appChoicesFromFlags(given ?? fail(addUsage), values);
  await addApp(root, choices);
  // An install whose dependencies are in keeps them in, new app included.
  const hasDependencies = existsSync(join(root, "node_modules"));
  if (hasDependencies) {
    await finishInstall(
      root,
      `apps/${choices.slug} has its files but the install doesn't have its dependencies`,
    );
  }
  // A pnpm dev already running starts the app; with no dependencies in,
  // none can be.
  const answer = hasDependencies
    ? await askDev(root, { operation: "add", slug: choices.slug })
    : ({ outcome: "not-running" } as const);
  console.log(
    afterAdd(choices.slug, answer, {
      hasDependencies,
      origin: dev.origin(choices.slug),
    }),
  );
  if (asked) {
    console.log(`
The same app without the questions:

  pnpm ${addCommandFor(choices)}`);
  }
}

async function migrateApp(): Promise<undefined> {
  const { positionals } = readArgs({ allowPositionals: true }, usage);
  const [, given, ...rest] = positionals;
  if (given === undefined || rest.length > 0) {
    throw new CommandProblem(migrateUsage);
  }
  const root = process.cwd();
  await readInstallChoices(root);
  const slug = readSlug(given);
  if (isProblem(slug)) throw new CommandProblem(slug.error);
  console.log(afterMigrate(await askDev(root, { operation: "migrate", slug })));
}

async function upgradeInstall(): Promise<undefined> {
  const { values, positionals } = readArgs(
    {
      allowPositionals: true,
      // The first step runs `robkit upgrade --finish <version>` on the
      // robkit it installs. An owner never types it.
      options: { finish: { type: "string" } },
    },
    upgradeUsage,
  );
  const [, given, ...rest] = positionals;
  const finishing = values.finish;
  if (rest.length > 0 || (finishing !== undefined && given !== undefined)) {
    throw new CommandProblem(upgradeUsage);
  }
  const root = process.cwd();
  await readInstallChoices(root);
  if (finishing === undefined) {
    const said = await upgrade(root, given, process.env);
    if (said !== undefined) console.log(said);
    return;
  }
  const changelog = await readFile(
    new URL("../CHANGELOG.md", import.meta.url),
    "utf8",
  ).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  console.log(
    await finishUpgrade(root, {
      from: finishing,
      repo: await readRobkitRepo(),
      changelog,
      env: process.env,
    }),
  );
}

function fail(message: string): never {
  throw new CommandProblem(message);
}
