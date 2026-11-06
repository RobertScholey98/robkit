import { readSlug } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { slug } from "./index.ts";

describe("slug", () => {
  it("builds the slug session reads", () => {
    expect(slug("notes")).toBe(readSlug("notes"));
    expect(slug("hub")).toBe("hub");
  });

  it("throws session's problem for a name that isn't a slug", () => {
    expect(() => slug("Notes")).toThrow(
      `"Notes" can't be an app's slug, which is also its subdomain and database role.`,
    );
  });
});
