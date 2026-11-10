#!/usr/bin/env node
import { runCommand } from "@robkit/input/command";
import { robkitCore } from "./robkit-core.ts";

process.exit(
  await runCommand(() => robkitCore(process.argv.slice(2), process.env)),
);
