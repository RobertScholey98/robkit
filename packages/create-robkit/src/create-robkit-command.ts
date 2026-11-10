#!/usr/bin/env node
// init's entry file. It checks Node's version before anything else loads,
// so an older Node prints what to do and not a syntax error from a module
// it can't run. A static import would load before this check wherever it
// sits in the file, so this file has none: the command loads with import().

const version = process.versions.node;

if (Number(version.split(".")[0]) < 24) {
  console.error(
    `Node ${version} is too old: robkit needs Node 24 or later. Install it from https://nodejs.org, then run npm create robkit again.`,
  );
  process.exitCode = 1;
} else {
  await import("./init-command.ts");
}
