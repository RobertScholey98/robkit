import { provisionDatabases, readProvisionConfig } from "@robkit/provision";
import { orExit } from "@robkit/input";

// The provision step in production. Core's container runs it before core
// migrates and starts, and core's own process never sees the admin URL or
// the secret. It gives every app with a database its schema and role, whose
// password comes from ROBKIT_DB_SECRET.

const config = orExit(readProvisionConfig(process.env));

const provisioned = await provisionDatabases(config);
if (provisioned.outcome !== "provisioned") {
  console.error(provisioned.error);
  process.exit(1);
}
console.log(`provisioned ${config.slugs.join(", ")}`);
