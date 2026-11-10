#!/usr/bin/env node
import { runCommand } from "@robkit/input/command";
import { runDev } from "./runner.ts";

process.exit(await runCommand(() => runDev(process.cwd(), process.env)));
