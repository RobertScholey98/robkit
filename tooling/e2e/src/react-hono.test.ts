import { describeJourneys } from "./install-journeys.ts";

// The React + Hono example's button is an HTML form, answered 303.
describeJourneys("react-hono", { posts: "form" });
