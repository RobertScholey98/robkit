#!/usr/bin/env node
import { runCommand } from "@robkit/input/command";
import { reportToConsole } from "@robkit/input/report";
import { withoutQueryValues } from "./query-values.ts";
import { robkitCore } from "./robkit-core.ts";

// A fault at start-up, such as storing a new signing key, is reported
// without its query's values, as createApp reports a route's.
process.exit(
  await runCommand(
    () => robkitCore(process.argv.slice(2), process.env),
    withoutQueryValues(reportToConsole),
  ),
);
