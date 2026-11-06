#!/usr/bin/env node
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CommandProblem, runCommand } from "@robkit/dev/cli";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
  type Slug,
} from "@robkit/session/addresses";
import { isProblem, parseJson, type InputProblem } from "@robkit/session/input";
import { addApp, readInstallChoices } from "./add.ts";
import { readArgs } from "./args.ts";
import {
  addCommandFor,
  addUsage,
  appChoicesFromFlags,
  askAdd,
} from "./add-wizard.ts";
import { readCoolifyConfig } from "./coolify-config.ts";
import { deploy } from "./coolify-deploy.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import {
  readAffectedApps,
  readAppList,
  readCoolify,
  readDatabaseUrlsConfig,
} from "./env.ts";
import { installDependencies } from "./set-up.ts";
import { vendorDir, vendorPackages } from "./vendor.ts";

/** Where an install's apps answer under pnpm dev. */
const dev = addresses({ domain: defaultDomain, port: defaultDevPort });

const usage = `${addUsage}

Usage: robkit check

Checks that every app in the install keeps to the layer rule, and names
each place one breaks it.

Usage: robkit vendor

In an install made with --link, packs the robkit packages it links to into
${vendorDir} and points the install at them, so it builds without the
checkout.

Usage: robkit database-urls

Prints the DATABASE_URL of each app with a database, as KEY=value lines to
set once as shared variables on the host. Reads the host's Postgres admin
URL from ROBKIT_ADMIN_DATABASE_URL and the install's database secret from
ROBKIT_DB_SECRET.

Usage: robkit deploy [--all | --apps <list>] [--dry-run]

Brings the install's applications on Coolify in line with the install, as
coolify.json describes it, then deploys core and the apps that changed
since TURBO_SCM_BASE. Reads COOLIFY_URL and COOLIFY_TOKEN. With --dry-run,
prints each app's variables and contacts nothing.`;

process.exitCode = await runCommand(async () => {
  const [command] = process.argv.slice(2);
  const commands: Record<string, () => Promise<number | undefined>> = {
    check,
    vendor,
    "database-urls": printDatabaseUrls,
    deploy: deployInstall,
  };
  return (commands[command ?? ""] ?? add)();
});

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
  const { positionals } = readArgs({ allowPositionals: true }, usage);
  if (positionals.length > 1) throw new CommandProblem(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  await vendorPackages(root);
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
  const coolify = dryRun ? undefined : readCoolify(process.env);
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
    return;
  }
  const affected = values.all
    ? "all"
    : values.apps === undefined
      ? await affectedApps(root)
      : readAppList(values.apps);
  if (isProblem(affected)) throw new CommandProblem(affected.error);
  const ok = await deploy({
    coolify,
    config,
    deployments,
    affected,
  });
  return ok ? 0 : 1;
}

/** The apps turbo finds changed since TURBO_SCM_BASE, by slug. */
async function affectedApps(root: string): Promise<Slug[] | InputProblem> {
  const { stdout } = await promisify(exec)(
    "turbo ls --affected --output json",
    { cwd: root },
  );
  const parsed = parseJson(stdout, "turbo ls --affected's output");
  return isProblem(parsed) ? parsed : readAffectedApps(parsed.json);
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
    await installDependencies(root);
  }
  console.log(`Added apps/${choices.slug}. Next:
${hasDependencies ? "" : "\n  pnpm install"}
  pnpm dev

Then open ${dev.origin(choices.slug)}.`);
  if (asked) {
    console.log(`
The same app without the questions:

  pnpm ${addCommandFor(choices)}`);
  }
}

function fail(message: string): never {
  throw new CommandProblem(message);
}
