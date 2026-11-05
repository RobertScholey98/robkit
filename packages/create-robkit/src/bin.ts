#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
} from "@robkit/session/addresses";
import { choicesFromFlags, choiceTable } from "./choices.ts";
import { init } from "./init.ts";
import { usage } from "./usage.ts";
import { askInit, commandFor } from "./wizard.ts";

/** Where a fresh install's hub answers under pnpm dev. */
const hubOrigin = addresses({
  domain: defaultDomain,
  port: defaultDevPort,
}).origin("hub");

/** Each choice's flag, from the table, as `parseArgs` takes it. */
const choiceFlags = Object.fromEntries(
  Object.values(choiceTable).map(({ flag }) => [
    flag,
    { type: "string" } as const,
  ]),
);

function fail(message: string): never {
  throw new Error(message);
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ...choiceFlags,
      install: { type: "boolean" },
      link: { type: "boolean" },
    },
  });
  if (positionals.length > 1) throw new Error(usage);
  const { link = false, ...flags } = values;
  const [given] = positionals;
  const answers =
    Object.keys(flags).length === 0 ? await askInit(given) : undefined;
  const {
    folder,
    install = false,
    ...picked
  } = answers ?? {
    ...flags,
    folder: given ?? fail(usage),
  };
  const choices = choicesFromFlags(picked);
  const dir = resolve(folder);
  await init(choices, dir, { link, install });
  console.log(`Wrote a robkit install in ${dir}. Next:

  cd ${folder}${install ? "" : "\n  pnpm install"}
  pnpm dev

Then open ${hubOrigin}, claim the install as its owner,
or sign in as a guest with the code test.`);
  if (answers) {
    console.log(`
The same install without the questions:

  ${commandFor(answers, link)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
