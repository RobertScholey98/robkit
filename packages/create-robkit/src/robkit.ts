#!/usr/bin/env node
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
import { exportApp } from "./export.ts";
import { importApp } from "./import.ts";
import { updateApp } from "./update.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import { installDependencies } from "./set-up.ts";
import { vendorDir, vendorPackages } from "./vendor.ts";

/** Where an install's apps answer under pnpm dev. */
const dev = addresses({ domain: defaultDomain, port: defaultDevPort });

const exportUsage = `Usage: robkit export <name> [--out <folder>]

Writes apps/<name> as a repo of its own, by default in ../<name> beside the
install: the app's files, a copy of the install code it uses in shared/,
and the catalog's versions written out. The first export makes the folder a
git repository, and each later one commits what changed.`;

const importUsage = `Usage: robkit import <folder or git URL> [--as <name>]

Brings an app's repo, as robkit export writes it, into apps/<name>, named
as its manifest says unless --as names it. Its shared/ code maps back onto
the install's own packages where they're the same, and stays in the app
where they differ. It refuses an app made for a robkit contract version
the install can't run.`;

const updateUsage = `Usage: robkit update <name> [--force]

Brings apps/<name>, which robkit import brought in, up to the newest export
of the folder or git URL it came from. Your own edits stay: it merges them
with the export's changes as git merges a branch, and marks any lines both
changed as git marks a conflict. --force replaces the app with the export
instead. Its schema and data stay, and its seed doesn't run again.`;

const usage = `${addUsage}

${exportUsage}

${importUsage}

${updateUsage}

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
    export: exportCommand,
    import: importCommand,
    update: updateCommand,
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

/** "a, b and c". */
function andList(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${last}`
    : last;
}

async function exportCommand(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" } },
  });
  const [, slug, ...rest] = positionals;
  if (slug === undefined || rest.length > 0) throw new Error(exportUsage);
  const root = process.cwd();
  const { dir, shared, committed } = await exportApp(root, slug, {
    ...(values.out !== undefined && { out: resolve(values.out) }),
  });
  console.log(
    committed
      ? `Exported apps/${slug} to ${dir} and committed it.`
      : `Exported apps/${slug} to ${dir}. Nothing changed since the last export.`,
  );
  if (shared.length > 0) {
    console.log(`shared/ holds the install code it uses: ${andList(shared)}.`);
  }
  console.log(`
To import it into another install, run this in that install's folder:

  pnpm robkit import ${dir}`);
}

async function importCommand(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { as: { type: "string" } },
  });
  const [, source, ...rest] = positionals;
  if (source === undefined || rest.length > 0) throw new Error(importUsage);
  const root = process.cwd();
  const { slug, name, mapped, kept, catalogued, differences } = await importApp(
    root,
    source,
    {
      ...(values.as !== undefined && { as: values.as }),
    },
  );
  const lines = [`Imported ${name} as apps/${slug}.`];
  if (mapped.length > 0) {
    lines.push(`It uses the install's own ${andList(mapped)}.`);
  }
  for (const [from, to] of kept) {
    lines.push(
      `It keeps its own ${from} as ${to}, since this install's differs.`,
    );
  }
  if (catalogued.length > 0) {
    lines.push(
      `Added to the catalog: ${andList(catalogued.map(([dep, version]) => `${dep} ${version}`))}.`,
    );
  }
  for (const { name: dep, asked, catalog } of differences) {
    lines.push(
      `It asked for ${dep} ${asked} and gets the catalog's ${catalog}.`,
    );
  }
  // An install whose dependencies are in keeps them in, new app included.
  const hasDependencies = existsSync(join(root, "node_modules"));
  if (hasDependencies) await installDependencies(root);
  console.log(`${lines.join(" ")} Next:
${hasDependencies ? "" : "\n  pnpm install"}
  pnpm dev

Then open ${dev.origin(slug)}. pnpm dev gives it its schema, runs its migrations and, on a new schema, its seed.`);
}

async function updateCommand(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { force: { type: "boolean", default: false } },
  });
  const [, slug, ...rest] = positionals;
  if (slug === undefined || rest.length > 0) throw new Error(updateUsage);
  const root = process.cwd();
  const { from, changed, conflicts, catalogued, differences } = await updateApp(
    root,
    slug,
    { force: values.force },
  );
  if (!changed) {
    console.log(`apps/${slug} is up to date with ${from}.`);
    return;
  }
  if (conflicts.length > 0) {
    console.log(
      `Updated apps/${slug} from ${from}, but your edits and the export's changes touch the same lines in ${andList(conflicts)}. Each place holds both, marked as git marks a conflict: yours after <<<<<<<, the export's after =======, ending at >>>>>>>. Keep what you want and delete the marker lines, then run pnpm install and pnpm dev.`,
    );
    process.exitCode = 1;
    return;
  }
  const lines = [
    values.force
      ? `Replaced apps/${slug} with the newest export from ${from}.`
      : `Updated apps/${slug} from ${from}, keeping your own edits.`,
  ];
  if (catalogued.length > 0) {
    lines.push(
      `Added to the catalog: ${andList(catalogued.map(([dep, version]) => `${dep} ${version}`))}.`,
    );
  }
  for (const { name: dep, asked, catalog } of differences) {
    lines.push(
      `It asked for ${dep} ${asked} and gets the catalog's ${catalog}.`,
    );
  }
  const hasDependencies = existsSync(join(root, "node_modules"));
  if (hasDependencies) await installDependencies(root);
  console.log(`${lines.join(" ")} Next:
${hasDependencies ? "" : "\n  pnpm install"}
  pnpm dev

pnpm dev runs only its new migrations: its data stays, and its seed doesn't run again.`);
}

async function vendor(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new Error(usage);
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
  const deployments = await deploymentOf(root, {
    domain: config.domain,
    trustedProxy: config.trustedProxy,
  });

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
    options: {
      stack: { type: "string" },
      access: { type: "string" },
      roles: { type: "string" },
      icon: { type: "string" },
    },
  });
  const [command, given, ...rest] = positionals;
  if (command !== "add" || rest.length > 0) throw new Error(usage);
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
  throw new Error(message);
}
