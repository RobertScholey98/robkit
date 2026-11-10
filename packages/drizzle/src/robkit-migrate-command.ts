#!/usr/bin/env node
import { runCommand } from "@robkit/input/command";
import { robkitMigrate } from "./robkit-migrate.ts";

process.exit(
  await runCommand(() => robkitMigrate(process.argv.slice(2), process.env)),
);
