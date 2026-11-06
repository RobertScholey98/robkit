#!/usr/bin/env node
// pnpm preview-install: keeps one linked install up to date with this
// checkout's templates, for working on them. See the README's "Change a
// template".
import { resolve } from "node:path";
import { CommandProblem, runCommand } from "@robkit/dev/cli";
import { readArgs } from "./args.ts";
import { stackFrom } from "./choices.ts";
import { syncPreview, type PreviewSync } from "./preview.ts";

const usage = `Usage: pnpm preview-install [folder] [--stack <name>]

Makes a linked install in folder, ../robkit-preview by default, from this
checkout's templates. Run it again after you change a template: it writes
only the files that changed, and installs again only when a package.json
or pnpm-workspace.yaml did. --stack picks the example app's stack for a
new preview.`;

const checks = [
  "pnpm turbo run test --filter=@internal/hub-app --filter=@internal/admin-app --filter=@internal/core-client",
  "pnpm lint",
  "pnpm typecheck",
];

/** What the sync did, in a sentence or two. */
function summary(dir: string, sync: PreviewSync): string {
  if (sync.outcome === "made") {
    return `Made a preview install in ${dir}, linked to this checkout.`;
  }
  const { written, removed, installed } = sync;
  if (written.length === 0 && removed.length === 0) {
    return `${dir} is up to date with the templates.`;
  }
  const lines = [
    `Updated ${dir}:`,
    ...written.map((path) => `  wrote   ${path}`),
    ...removed.map((path) => `  removed ${path}`),
  ];
  if (installed) {
    lines.push(
      "",
      "A package.json or pnpm-workspace.yaml changed, so it installed again. A pnpm dev running there restarts core.",
    );
  }
  return lines.join("\n");
}

process.exitCode = await runCommand(async () => {
  const { values, positionals } = readArgs(
    { allowPositionals: true, options: { stack: { type: "string" } } },
    usage,
  );
  if (positionals.length > 1) throw new CommandProblem(usage);
  const dir = resolve(positionals[0] ?? "../robkit-preview");
  const stack =
    values.stack === undefined ? undefined : stackFrom(values.stack);
  const sync = await syncPreview(dir, { stack });
  console.log(`${summary(dir, sync)}

Check it with no Docker:

  cd ${dir}
${checks.map((check) => `  ${check}`).join("\n")}

or run pnpm dev there, which starts Postgres in Docker.`);
  return 0;
});
