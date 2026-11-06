import { startPostgres } from "@internal/test-postgres";
import { databasePassword, databaseUrl, provisionDatabases } from "@robkit/dev";
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
  // Production derives core's password from the install's secret; any
  // secret of 32 characters or more does for a test database.
  const secret = "core's test database secret, not a real one";
  await provisionDatabases({ adminUrl, secret, slugs: ["core"] });
  project.provide(
    "databaseUrl",
    databaseUrl(adminUrl, "core", databasePassword(secret, "core")),
  );
  return stop;
}
