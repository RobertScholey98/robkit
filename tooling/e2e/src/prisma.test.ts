import { describeJourneys } from "./install-journeys.ts";

// Every journey but the role one, which tests nothing the ORM touches.
describeJourneys("prisma", { roles: false });
