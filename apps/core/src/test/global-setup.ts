import { startPostgres } from "@internal/test-postgres";
import { provisionDatabase } from "@robkit/dev";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    /** Core's own `DATABASE_URL`, connecting as the core role. */
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const { adminUrl, stop } = await startPostgres();
  project.provide("adminUrl", adminUrl);
  project.provide("databaseUrl", await provisionDatabase(adminUrl, "core"));
  return stop;
}
