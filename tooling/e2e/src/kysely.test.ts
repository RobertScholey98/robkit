import { describeJourneys } from "./install-journeys.ts";

// Every journey but the role one, which tests nothing the ORM touches. Its
// two apps are both on Kysely, so each migrates without finding the other's
// migration tables.
describeJourneys("kysely", { roles: false });
