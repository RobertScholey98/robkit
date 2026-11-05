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
import { addApp } from "./add.ts";
import { installApp, restoreApps, shareApp, updateApp } from "./app-repo.ts";
import {
  addCommandFor,
  addUsage,
  appChoicesFromFlags,
  askAdd,
} from "./add-wizard.ts";
import { checkInstall, describeProblem } from "./check.ts";
import { deploy, readCoolifyConfig } from "./coolify.ts";
import { databaseUrls, deploymentOf } from "./deployment.ts";
import { git } from "./git.ts";
import {
  movedAppRepos,
  readInstallRecord,
  type InstallRecord,
} from "./record.ts";
import { installDependencies } from "./set-up.ts";
import { vendorDir, vendorPackages } from "./vendor.ts";

/** Where an install's apps answer under pnpm dev. */
const dev = addresses({ domain: defaultDomain, port: defaultDevPort });

const shareUsage = `Usage: robkit share <app> [<git URL or path>] [--message <text>]

Commits what the app has changed, then pushes it to the git URL or path,
or else to its upstream, or else to a new bare repository at
../robkit-apps/<app>.git beside the install. A path with no repository
gets a bare one. The app's upstream becomes where it went.`;

const installUsage = `Usage: robkit install <git URL or path> [--as <app>]

Clones an app repo into apps/<app>, named after the repo unless --as names
it, if its manifest names a robkit contract this install runs.

Usage: robkit install

Clones again every app repo robkit.json lists that the install lacks, at
the commit it records, as a fresh clone of the install needs.`;

const updateUsage = `Usage: robkit update <app>

Pulls the app's upstream into apps/<app> with git. What this install
changed in the app is committed first, so git merges the two.`;

const usage = `${addUsage}

${shareUsage}

${installUsage}

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
    "database-urls": printDatabaseUrls,
    deploy: deployInstall,
    share,
    install: installCommand,
    update,
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
  await readInstallRecord(root);
  const problems = await checkInstall(root);
  for (const problem of problems) console.log(describeProblem(problem));
  if (problems.length > 0) process.exitCode = 1;
}

async function vendor(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1) throw new Error(usage);
  const root = process.cwd();
  // Refuses a folder that isn't an install.
  await readInstallRecord(root);
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
  await readInstallRecord(root);
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
  await readInstallRecord(root);
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

/**
 * The apps changed since TURBO_SCM_BASE, by slug: those turbo finds, and
 * the app repos whose commit robkit.json records moved.
 */
async function affectedApps(root: string): Promise<string[]> {
  const base = process.env.TURBO_SCM_BASE;
  const before =
    base === undefined
      ? undefined
      : await git(root, ["show", `${base}:robkit.json`]).then(
          (text) => JSON.parse(text) as InstallRecord,
          () => undefined,
        );
  const moved = movedAppRepos(before, await readInstallRecord(root));
  return [...new Set([...(await turboAffected(root)), ...moved])];
}

/** The apps turbo finds changed since TURBO_SCM_BASE, by slug. */
async function turboAffected(root: string): Promise<string[]> {
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
  await readInstallRecord(root);
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

/** Installs the install's dependencies again, if they're installed. */
async function refreshDependencies(root: string): Promise<boolean> {
  const has = existsSync(join(root, "node_modules"));
  if (has) await installDependencies(root);
  return has;
}

async function share(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { message: { type: "string", short: "m" } },
  });
  const [, slug, target, ...rest] = positionals;
  if (slug === undefined || rest.length > 0) throw new Error(shareUsage);
  const shared = await shareApp(process.cwd(), slug, {
    target,
    ...(values.message !== undefined && { message: values.message }),
  });
  console.log(`Shared apps/${slug} to ${shared.source}${shared.created ? ", a new bare repository" : ""}, at ${shared.revision.slice(0, 7)}.

Another install takes it with:

  pnpm robkit install ${shared.source}

and brings in later shares with pnpm robkit update ${slug}.`);
}

async function installCommand(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { as: { type: "string" } },
  });
  const [, source, ...rest] = positionals;
  if (rest.length > 0) throw new Error(installUsage);
  const root = process.cwd();
  if (source === undefined) {
    if (values.as !== undefined) throw new Error(installUsage);
    await restore(root);
    return;
  }
  const installed = await installApp(root, source, { as: values.as });
  const hasDependencies = await refreshDependencies(root);
  const about = installed.description ? `\n${installed.description}\n` : "";
  console.log(`Installed ${installed.name} as apps/${installed.slug}, from ${installed.source}.
${about}
Next:
${hasDependencies ? "" : "\n  pnpm install"}
  pnpm dev

Then open ${dev.origin(installed.slug)}.`);
}

async function restore(root: string): Promise<void> {
  const { restored, unshared } = await restoreApps(root);
  for (const slug of restored) console.log(`Restored apps/${slug}.`);
  if (restored.length > 0) await refreshDependencies(root);
  if (unshared.length > 0) {
    throw new Error(
      unshared
        .map(
          (slug) =>
            `apps/${slug} was never shared, so this install can't fetch it. Share it from the install that made it with pnpm robkit share ${slug} <git URL>, then commit that install's robkit.json.`,
        )
        .join("\n"),
    );
  }
  if (restored.length === 0) {
    console.log("Every app robkit.json lists is here.");
  }
}

async function update(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [, slug, ...rest] = positionals;
  if (slug === undefined || rest.length > 0) throw new Error(updateUsage);
  const root = process.cwd();
  const updated = await updateApp(root, slug);
  if (updated.incoming === 0) {
    console.log(`apps/${slug} already has everything ${updated.source} has.`);
    return;
  }
  await refreshDependencies(root);
  const commits = updated.incoming === 1 ? "commit" : "commits";
  console.log(`Brought ${String(updated.incoming)} ${commits} into apps/${slug} from ${updated.source}.

Restart pnpm dev to migrate the app's database and serve the new version.`);
}

function fail(message: string): never {
  throw new Error(message);
}
