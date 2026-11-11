import { startPostgres } from "@internal/test-postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    /** The test Postgres's container, whose log a test can read. */
    postgresContainer: string;
  }
}

export default async function setup(project: TestProject) {
  const { adminUrl, project: compose, stop } = await startPostgres();
  project.provide("adminUrl", adminUrl);
  project.provide("postgresContainer", `${compose}-postgres-1`);
  return stop;
}
