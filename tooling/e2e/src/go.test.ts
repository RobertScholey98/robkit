import { describeJourneys } from "./install-journeys.ts";

// The Go example calls its API from its page with sessionFetch.
describeJourneys("go", { serverFunction: true });
