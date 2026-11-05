#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
} from "@robkit/session/addresses";
import { stackFrom } from "./choices.ts";
import { init } from "./init.ts";
import { usage } from "./usage.ts";
import { askInit, commandFor } from "./wizard.ts";

/** Where a fresh install's hub answers under pnpm dev. */
const hubOrigin = addresses({
  domain: defaultDomain,
  port: defaultDevPort,
}).origin("hub");

function fail(message: string): never {
  throw new Error(message);
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      stack: { type: "string" },
      install: { type: "boolean", default: false },
      link: { type: "boolean", default: false },
    },
  });
  if (positionals.length > 1) throw new Error(usage);
  const { install, link } = values;
  const [given] = positionals;
  // --stack answers init's questions, so it needs the folder too.
  const asked = values.stack === undefined;
  const answers =
    values.stack === undefined
      ? await askInit(given)
      : { folder: given ?? fail(usage), stack: stackFrom(values.stack) };
  const dir = resolve(answers.folder);
  await init({ exampleStack: answers.stack }, dir, { link, install });
  const steps = [
    `cd ${answers.folder}`,
    // Husky sets its hook up on install, and only in a git repository.
    ...(install ? [] : ["git init", "pnpm install"]),
    "pnpm dev",
  ];
  console.log(`Wrote a robkit install in ${dir}. Next:

${steps.map((step) => `  ${step}`).join("\n")}

Then open ${hubOrigin}, claim the install as its owner,
or sign in as a guest with the code test.`);
  if (asked) {
    console.log(`
The same install without the questions:

  ${commandFor(answers, { install, link })}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
