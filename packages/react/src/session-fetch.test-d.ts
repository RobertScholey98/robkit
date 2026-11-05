import { describe, expectTypeOf, it } from "vitest";
import { sessionFetch } from "./index.ts";

describe("@robkit/react's types", () => {
  it("takes and answers what fetch does, so it can stand in for it", () => {
    expectTypeOf(sessionFetch).toEqualTypeOf<typeof fetch>();
  });

  it("refuses a call fetch would refuse", () => {
    // @ts-expect-error fetch needs something to fetch.
    void sessionFetch();
    // @ts-expect-error A number isn't a URL or a request.
    void sessionFetch(42);
    // @ts-expect-error Its options are fetch's.
    void sessionFetch("/api/notes", { method: 1 });
  });
});
