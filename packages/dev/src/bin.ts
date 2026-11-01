#!/usr/bin/env node
import { runDev } from "./runner.ts";

process.exit(await runDev(process.cwd(), process.env));
