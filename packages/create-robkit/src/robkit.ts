#!/usr/bin/env node
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
} from "@robkit/session/addresses";
import { addApp, readInstallChoices } from "./add.ts";
import {
  addCommandFor,
  addUsage,
  appChoicesFromFlags,
  askAdd,
} from "./add-wizard.ts";
import { checkInstall, describeProblem } from "./check.ts";
import { deploy, readCoolifyConfig } from "./coolify.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
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

try {
  const [command] = process.argv.slice(2);
  const commands: Record<string, () => Promise<void>> = {
    check,
    vendor,
    "database-urls": printDatabaseUrls,
    deploy: deployInstall,
  };
  await (commands[command ?? ""] ?? add)();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function check(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new Error(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const problems = await checkInstall(root);
  for (const problem of problems) console.log(describeProblem(problem));
  if (problems.length > 0) process.exitCode = 1;
}

async function vendor(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new Error(usage);
  const root = process.cwd();
  const installed = await readInstallChoices(root);
  await vendorPackages(root);
  if (existsSync(join(root, "node_modules"))) {
    await installDependencies(root, installed.packageManager);
  }
  console.log(
    `Packed robkit's packages into ${vendorDir}. Commit it with the install.`,
  );
}

async function printDatabaseUrls(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new Error(usage);
  const root = process.cwd();
  await readInstallChoices(root);
  const adminUrl = process.env.ROBKIT_ADMIN_DATABASE_URL;
  const secret = process.env.ROBKIT_DB_SECRET;
  if (!adminUrl || !secret) {
    throw new Error(
      "Set ROBKIT_ADMIN_DATABASE_URL to the host's Postgres admin URL and ROBKIT_DB_SECRET to the install's database secret.",
    );
  }
  for (const [name, url] of await databaseUrls(root, { adminUrl, secret })) {
    console.log(`${name}=${url}`);
  }
}

async function deployInstall(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: "boolean", default: false },
      apps: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (positionals.length > 1) throw new Error(usage);
  const root = process.cwd();
  await readInstallChoices(root);
  const { COOLIFY_URL: url, COOLIFY_TOKEN: token } = process.env;
  const dryRun = values["dry-run"];
  // An install's CI deploys from its first push, before Coolify is set up.
  if (!url && !dryRun) {
    console.log("COOLIFY_URL is not set, so nothing was deployed.");
    return;
  }
  const configPath = join(root, "coolify.json");
  if (!existsSync(configPath)) {
    throw new Error(
      "This install has no coolify.json. See docs/deploy.md to set one up.",
    );
  }
  const config = readCoolifyConfig(await readFile(configPath, "utf8"));
  const deployments = await deploymentOf(root, { domain: config.domain });

  if (dryRun || !url) {
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
  if (!token) throw new Error("Set COOLIFY_TOKEN to deploy.");
  const {
    CF_ACCESS_CLIENT_ID: accessId,
    CF_ACCESS_CLIENT_SECRET: accessSecret,
  } = process.env;

  const affected = values.all
    ? "all"
    : (values.apps?.split(",").map((app) => app.trim()) ??
      (await affectedApps(root)));
  const ok = await deploy({
    coolify: {
      url,
      token,
      ...(accessId && accessSecret && { accessId, accessSecret }),
    },
    config,
    deployments,
    affected,
  });
  if (!ok) process.exitCode = 1;
}

/** The apps turbo finds changed since TURBO_SCM_BASE, by slug. */
async function affectedApps(root: string): Promise<string[]> {
  const { stdout } = await promisify(exec)(
    "turbo ls --affected --output json",
    { cwd: root },
  );
  const items =
    (JSON.parse(stdout) as { packages?: { items?: { path?: string }[] } })
      .packages?.items ?? [];
  return items.flatMap(({ path }) =>
    path?.startsWith("apps/") ? [path.slice("apps/".length)] : [],
  );
}

async function add(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      stack: { type: "string" },
      access: { type: "string" },
      roles: { type: "string" },
      icon: { type: "string" },
      "ui-kit": { type: "boolean" },
    },
  });
  const [command, given, ...rest] = positionals;
  if (command !== "add" || rest.length > 0) throw new Error(usage);
  const root = process.cwd();
  const installed = await readInstallChoices(root);
  const asked = Object.keys(values).length === 0;
  const choices = asked
    ? await askAdd(root, installed, given)
    : appChoicesFromFlags(given ?? fail(addUsage), values, installed);
  await addApp(root, choices);
  // An install whose dependencies are in keeps them in, new app included.
  const hasDependencies = existsSync(join(root, "node_modules"));
  if (hasDependencies) {
    await installDependencies(root, installed.packageManager);
  }
  const pm = installed.packageManager;
  console.log(`Added apps/${choices.slug}. Next:
${hasDependencies ? "" : `\n  ${pm} install`}
  ${pm} dev

Then open ${dev.origin(choices.slug)}.`);
  if (asked) {
    console.log(`
The same app without the questions:

  ${addCommandFor(choices)}`);
  }
}

function fail(message: string): never {
  throw new Error(message);
}
