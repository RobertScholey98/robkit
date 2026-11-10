import { startPostgres } from "@internal/test-postgres";
import { provisionDatabases } from "@robkit/provision";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    /** Core's own `DATABASE_URL`, connecting as the core role. */
    databaseUrl: string;
    /**
     * The secret core's password comes from. A test that runs the provision
     * step uses it too, so core's password stays the same for every test.
     */
    databaseSecret: string;
  }
}

// Production derives core's password from the install's secret; any
// secret of 32 characters or more does for a test database.
const databaseSecret = "core's test database secret, not a real one";

export default async function setup(project: TestProject) {
  const { adminUrl, stop } = await startPostgres();
  project.provide("adminUrl", adminUrl);
  const provisioned = await provisionDatabases({
    adminUrl,
    secret: databaseSecret,
    slugs: ["core"],
  });
  const databaseUrl =
    provisioned.outcome === "provisioned"
      ? provisioned.databaseUrls.get("core")
      : undefined;
  if (databaseUrl === undefined) {
    throw new Error(`Couldn't provision core's test database.`, {
      cause: provisioned,
    });
  }
  project.provide("databaseUrl", databaseUrl);
  project.provide("databaseSecret", databaseSecret);
  return stop;
}
