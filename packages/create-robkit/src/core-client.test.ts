import { isRecord } from "@robkit/session/input";
import { describe, expect, it } from "vitest";
import { isRecord as coreClientIsRecord } from "../templates/base/packages/core-client/src/call-core.ts";

// The install's core-client can't import robkit's session in the browser
// bundle without a new dependency, so it keeps its own isRecord. It must
// mean what session's does.
describe("core-client's isRecord", () => {
  it.each([
    {},
    { error: "Not found" },
    Object.create(null),
    [],
    [1, 2],
    null,
    undefined,
    "text",
    1,
    true,
    () => undefined,
  ])("answers %j as session's does", (value) => {
    expect(coreClientIsRecord(value)).toBe(isRecord(value));
  });

  it("refuses an array, as session's does", () => {
    expect(coreClientIsRecord([])).toBe(false);
  });
});
