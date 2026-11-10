import { startPostgres } from "@internal/test-postgres";
import { slug } from "@internal/test-session";
import { provisionDatabases } from "@robkit/provision";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    /** The `DATABASE_URL` of an app named `notes`, as its own role. */
    databaseUrl: string;
  }
}

const notes = slug("notes");

// Any secret of 32 characters or more does for a test database.
const databaseSecret = "the drizzle package's test secret, not a real one";

export default async function setup(project: TestProject) {
  const { adminUrl, stop } = await startPostgres();
  project.provide("adminUrl", adminUrl);
  const provisioned = await provisionDatabases({
    adminUrl,
    secret: databaseSecret,
    slugs: [notes],
  });
  const databaseUrl =
    provisioned.outcome === "provisioned"
      ? provisioned.databaseUrls.get(notes)
      : undefined;
  if (databaseUrl === undefined) {
    throw new Error(`Couldn't provision the notes app's test database.`, {
      cause: provisioned,
    });
  }
  project.provide("databaseUrl", databaseUrl);
  return stop;
}
