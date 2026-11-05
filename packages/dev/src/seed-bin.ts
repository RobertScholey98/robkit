#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { seedFile } from "./apps.ts";
import { seededMessage, seedOnce } from "./provision.ts";

// robkit-seed: in production, each app's start script runs it in the app's
// container after migrating, as pnpm dev's provision step does. It seeds
// the schema production's provision step made, once, as the app.
const { ROBKIT_APP: slug, DATABASE_URL: databaseUrl } = process.env;
if (!slug || !databaseUrl) {
  console.error("robkit-seed needs ROBKIT_APP and DATABASE_URL set.");
  process.exit(1);
}
const dir = process.cwd();
try {
  const seeds = existsSync(join(dir, seedFile));
  if (await seedOnce({ slug, dir, seeds }, databaseUrl)) {
    console.log(seededMessage);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
