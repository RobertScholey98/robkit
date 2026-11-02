#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { choicesFromFlags } from "./choices.ts";
import { generateInstall } from "./generate.ts";
import { writeInstall } from "./write.ts";

const usage = `Usage: npm create robkit <folder> -- [options]

  --pm <name>             package manager: pnpm
  --orm <name>            ORM: drizzle
  --tools <list>          dev tools: eslint-prettier
  --generators <list>     stacks robkit add offers, the first making the
                          example app: start, react-hono
  --link                  link the @robkit packages to the robkit checkout
                          this runs from, instead of installing them from npm`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pm: { type: "string" },
      orm: { type: "string" },
      tools: { type: "string" },
      generators: { type: "string" },
      link: { type: "boolean" },
    },
  });
  const [folder] = positionals;
  if (!folder || positionals.length > 1) throw new Error(usage);

  const choices = choicesFromFlags(values);
  const dir = resolve(folder);
  await writeInstall(
    dir,
    await generateInstall(choices, { link: values.link ?? false }),
  );
  console.log(`Wrote a robkit install in ${dir}. Next:

  cd ${folder}
  pnpm install
  pnpm dev

Then open http://hub.robkit.localhost:3000, claim the install as its owner,
or sign in as a guest with the code test.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
