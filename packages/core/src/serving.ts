// The serving process: what `robkit-core start` runs as its child, without
// the provisioning secrets, and what `robkit-core serve` runs under Node's
// watch mode in a checkout.
import { runCommand } from "@robkit/input/command";
import { serveCore } from "./serve-core.ts";

process.exit(await runCommand(() => serveCore(process.env)));
