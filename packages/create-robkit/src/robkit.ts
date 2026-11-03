#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
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
checkout.`;

try {
  const [command] = process.argv.slice(2);
  const commands: Record<string, () => Promise<void>> = { check, vendor };
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
