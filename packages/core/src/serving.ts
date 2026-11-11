// The serving process: what `robkit-core start` runs as its child, without
// the provisioning secrets, and what `robkit-core serve` runs under Node's
// watch mode in a checkout.
import { runCommand } from "@robkit/input/command";
import { reportToConsole } from "@robkit/input/report";
import { withoutQueryValues } from "./query-values.ts";
import { serveCore } from "./serve-core.ts";

// A fault at start-up, such as storing a new signing key, is reported
// without its query's values, as createApp reports a route's.
process.exit(
  await runCommand(
    () => serveCore(process.env),
    withoutQueryValues(reportToConsole),
  ),
);
