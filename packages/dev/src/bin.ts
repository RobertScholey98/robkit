#!/usr/bin/env node
import { runCommand } from "./cli.ts";
import { runDev } from "./runner.ts";

process.exit(await runCommand(() => runDev(process.cwd(), process.env)));
