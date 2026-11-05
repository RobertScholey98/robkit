import { provisionDatabases, readProvisionConfig } from "@robkit/dev";
import { isProblem } from "@robkit/session/input";

// The provision step in production. Core's container runs it before core
// migrates and starts, and core's own process never sees the admin URL or
// the secret. It gives every app with a database its schema and role, whose
// password comes from ROBKIT_DB_SECRET.

const config = readProvisionConfig(process.env);
if (isProblem(config)) {
  console.error(config.error);
  process.exit(1);
}

await provisionDatabases(config);
console.log(`provisioned ${config.slugs.join(", ")}`);
