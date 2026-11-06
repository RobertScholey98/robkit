import { isProblem } from "@robkit/session/input";
import { describe, expect, it } from "vitest";
import { readAccess, readDeclaredApps } from "./apps.ts";

describe("readDeclaredApps", () => {
  it("reads nothing from an unset or empty ROBKIT_APPS", () => {
    expect(readDeclaredApps({})).toEqual([]);
    expect(readDeclaredApps({ ROBKIT_APPS: " " })).toEqual([]);
  });

  it("reads each app's slug, rule and icon", () => {
    expect(
      readDeclaredApps({
        ROBKIT_APPS: JSON.stringify([
          { slug: "example" },
          {
            slug: "recipes",
            access: { kind: "roles", roles: ["Family"] },
            icon: "🍳",
          },
        ]),
      }),
    ).toEqual([
      { slug: "example" },
      {
        slug: "recipes",
        access: { kind: "roles", roleNames: ["Family"] },
        icon: "🍳",
      },
    ]);
  });

  const notSlug = `can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`;

  it.each([
    [
      "example,notes",
      /^ROBKIT_APPS isn't valid JSON \(.+\)\. Fix its syntax\.$/,
    ],
    [
      '{"slug":"notes"}',
      `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.`,
    ],
    ["null", /^ROBKIT_APPS must be a JSON list/],
    [
      "[null]",
      `ROBKIT_APPS[0] must be an object with the app's slug, such as {"slug": "notes"}.`,
    ],
    ['[{"slug":""}]', `ROBKIT_APPS[0].slug: "" ${notSlug}`],
    ['[{"icon":"📝"}]', `ROBKIT_APPS[0].slug: Nothing ${notSlug}`],
    [
      '[{"slug":"a"},{"slug":"b","access":{"kind":"everyone"}}]',
      'ROBKIT_APPS[1].access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.',
    ],
    [
      '[{"slug":"a","access":{"kind":"roles","roles":[]}}]',
      /^ROBKIT_APPS\[0\]\.access must be/,
    ],
    [
      '[{"slug":"a","icon":""}]',
      'ROBKIT_APPS[0].icon must be one emoji, such as "📝".',
    ],
  ])("refuses %s", (text, message) => {
    const read = readDeclaredApps({ ROBKIT_APPS: text });
    expect(isProblem(read) && read.error).toMatch(message);
  });
});

describe("readAccess", () => {
  it.each([
    { kind: "open" },
    { kind: "owner" },
    { kind: "roles", roles: ["role-family", "role-friends"] },
  ])("reads %j", (fields) => {
    expect(readAccess(fields)).toEqual(fields);
  });

  it("refuses a roles rule that names no role", () => {
    expect(readAccess({ kind: "roles", roles: [] })).toEqual({
      error: "Pick at least one role.",
    });
  });

  it.each([
    [{}, "Pick open, roles or owner."],
    [{ kind: "everyone" }, "Pick open, roles or owner."],
    [{ kind: "roles" }, "Pick at least one role."],
    [{ kind: "roles", roles: [""] }, "Pick at least one role."],
  ])("refuses %j", (fields, error) => {
    expect(readAccess(fields)).toEqual({ error });
  });
});
