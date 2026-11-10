import { describeJourneys } from "./install-journeys.ts";

// The Express example's button is an HTML form, answered 303.
describeJourneys("express", { posts: "form" });
