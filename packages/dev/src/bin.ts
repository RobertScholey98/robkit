#!/usr/bin/env node
import { runCommand } from "./run-command.ts";
import { runDev } from "./runner.ts";

process.exit(await runCommand(() => runDev(process.cwd(), process.env)));
