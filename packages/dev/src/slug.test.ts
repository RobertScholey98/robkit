import { describe, expect, it } from "vitest";
import { slugProblem } from "./slug.ts";

describe("slugProblem", () => {
  it.each(["notes", "start", "my_app", "a1", "x".repeat(63)])(
    "accepts %j",
    (name) => {
      expect(slugProblem(name)).toBeUndefined();
    },
  );

  it.each([
    "My-App",
    "my-app",
    "1notes",
    "_notes",
    "drop table x;--",
    "public",
    "postgres",
    "pg_admin",
    "x".repeat(64),
    "",
  ])("refuses %j", (name) => {
    expect(slugProblem(name)).toBe(
      `"${name}" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters, digits and underscores, start with a letter, and avoid public, postgres and pg_ names.`,
    );
  });
});
