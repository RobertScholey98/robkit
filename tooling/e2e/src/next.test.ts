import { describeJourneys } from "./install-journeys.ts";

// Next's example follows a link with a client navigation and calls a
// server action from its page. The test lets the hub frame one of its
// pages.
describeJourneys("next", { lapsedCalls: true, posts: true, hubFrames: true });
