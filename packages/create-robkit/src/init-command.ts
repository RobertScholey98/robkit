import { resolve } from "node:path";
import { CommandProblem, runCommand } from "@robkit/dev/cli";
import {
  defaultDevPort,
  defaultDomain,
  install as addresses,
} from "@robkit/input/addresses";
import { readArgs } from "./args.ts";
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
  throw new CommandProblem(message);
}

process.exitCode = await runCommand(async () => {
  const { values, positionals } = readArgs(
    {
      allowPositionals: true,
      options: {
        stack: { type: "string" },
        "no-install": { type: "boolean", default: false },
        link: { type: "boolean", default: false },
      },
    },
    usage,
  );
  if (positionals.length > 1) throw new CommandProblem(usage);
  const { link } = values;
  const install = !values["no-install"];
  const [given] = positionals;
  // --stack answers init's questions, so it needs the folder too.
  const asked = values.stack === undefined;
  const answers =
    values.stack === undefined
      ? await askInit(given)
      : { folder: given ?? fail(usage), stack: stackFrom(values.stack) };
  // Printed before the install's output, so the next steps come last.
  if (asked) {
    console.log(`
The same install without the questions:

  ${commandFor(answers, { install, link })}
`);
  }
  const dir = resolve(answers.folder);
  const { notes } = await init({ exampleStack: answers.stack }, dir, {
    link,
    install,
  });
  for (const note of notes) console.log(note);
  const steps = [
    `cd ${answers.folder}`,
    ...(install ? [] : ["pnpm install"]),
    "pnpm dev",
  ];
  console.log(`Made a robkit install in ${dir}. Next:

${steps.map((step) => `  ${step}`).join("\n")}

Then open ${hubOrigin} and claim the install.`);
  return 0;
});
