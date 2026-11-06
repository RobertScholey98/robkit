import { describe, expect, it } from "vitest";
import { isPlatformApp, platformApps, readSlug, slugProblem } from "./slug.ts";

describe("the platform apps", () => {
  it("names them", () => {
    expect(platformApps).toEqual(["core", "hub", "admin"]);
    expect(
      ["core", "hub", "admin", "notes", "hubs"].map(isPlatformApp),
    ).toEqual([true, true, true, false, false]);
  });

  it.each(platformApps)("%s is a slug", (name) => {
    expect(readSlug(name)).toBe(name);
  });
});

describe("readSlug", () => {
  it.each(["notes", "start", "blog2", "a1", "x".repeat(63), "admin"])(
    "reads %j",
    (name) => {
      expect(readSlug(name)).toBe(name);
    },
  );

  it.each([
    "My-App",
    "my-app",
    "my_app",
    "1notes",
    "_notes",
    "drop table x;--",
    "public",
    "postgres",
    "pg_admin",
    "x".repeat(64),
    "",
  ])("refuses %j", (name) => {
    expect(readSlug(name)).toEqual({
      error: `"${name}" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });

  it.each([
    [null, "null"],
    [42, "42"],
    [undefined, "Nothing"],
    [["notes"], '["notes"]'],
  ])("refuses %j, which isn't text", (value, shown) => {
    expect(readSlug(value)).toEqual({
      error: `${shown} can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });
});

describe("slugProblem", () => {
  it("says why a name can't be a slug, for a prompt's validate", () => {
    expect(slugProblem("notes")).toBeUndefined();
    expect(slugProblem("My-App")).toMatch(/^"My-App" can't be an app's slug/);
  });
});
