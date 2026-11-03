#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { choicesFromFlags } from "./choices.ts";
import { generateInstall } from "./generate.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { askInit, commandFor } from "./wizard.ts";
import { writeInstall } from "./write.ts";

const usage = `Usage: npm create robkit [folder] -- [options]

With no options, init asks for each one.

  --pm <name>             package manager: pnpm
  --orm <name>            ORM: drizzle
  --generators <list>     stacks robkit add offers, the first making the
                          example app: start, react-hono
  --tools <list>          dev tools: eslint-prettier, or none
  --install               install dependencies and initialise git
  --link                  link the @robkit packages to the robkit checkout
                          this runs from, instead of installing them from npm`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pm: { type: "string" },
      orm: { type: "string" },
      generators: { type: "string" },
      tools: { type: "string" },
      install: { type: "boolean" },
      link: { type: "boolean" },
    },
  });
  if (positionals.length > 1) throw new Error(usage);
  const { link = false, ...flags } = values;
  const asking = Object.keys(flags).length === 0;
  const [given] = positionals;
  if (!asking && !given) throw new Error(usage);

  const answers = asking ? await askInit(given) : undefined;
  const folder = answers?.folder ?? given ?? "";
  const install = answers?.install ?? flags.install ?? false;
  const choices = choicesFromFlags(answers ?? flags);
  const pm = choices.packageManager;
  const dir = resolve(folder);
  await writeInstall(dir, await generateInstall(choices, { link }));
  if (install) {
    await installDependencies(dir, pm);
    await initGit(dir);
  }
  console.log(`Wrote a robkit install in ${dir}. Next:

  cd ${folder}${install ? "" : `\n  ${pm} install`}
  ${pm} dev

Then open http://hub.robkit.localhost:3000, claim the install as its owner,
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
