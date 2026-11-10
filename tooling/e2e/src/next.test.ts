import { describeJourneys } from "./install-journeys.ts";

// Next's example follows a link with a client navigation and calls a
// server action from its page.
describeJourneys("next", { lapsedCalls: true, posts: true });
