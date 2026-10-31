import { describe, expect, it } from "vitest";
import { coreOrigin } from "./core-origin.ts";

describe("coreOrigin", () => {
  it.each([
    ["http://hub.localhost:3000/", "http://core.localhost:3000"],
    ["https://hub.example.com/apps?x=1", "https://core.example.com"],
    ["https://hub.hub.example.com/", "https://core.hub.example.com"],
  ])("finds core beside the hub at %s", (page, core) => {
    expect(coreOrigin(page)).toBe(core);
  });

  it("refuses a page that is not on the hub's subdomain", () => {
    expect(() => coreOrigin("http://localhost:5173/")).toThrow(/hub\./);
  });
});
