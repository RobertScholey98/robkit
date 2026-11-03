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
import { installDependencies } from "./set-up.ts";

/** Where an install's apps answer under pnpm dev. */
const dev = addresses({ domain: defaultDomain, port: defaultDevPort });

try {
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
  if (command !== "add" || rest.length > 0) throw new Error(addUsage);
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
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function fail(message: string): never {
  throw new Error(message);
}
