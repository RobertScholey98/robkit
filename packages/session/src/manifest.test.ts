import { describe, expect, it } from "vitest";
import {
  appDeclarationJson,
  readAppDeclaration,
  readDeclaredApp,
} from "./manifest.ts";

describe("readAppDeclaration", () => {
  it("reads what an app declares", () => {
    expect(
      readAppDeclaration({
        access: { kind: "roles", roles: ["Family"] },
        icon: "📝",
      }),
    ).toEqual({ access: { kind: "roles", roleNames: ["Family"] }, icon: "📝" });
    expect(readAppDeclaration({ access: { kind: "open" } })).toEqual({
      access: { kind: "open" },
    });
    expect(readAppDeclaration(undefined)).toEqual({});
  });

  it.each([null, [], "open", 1])("refuses %j as the field", (value) => {
    expect(readAppDeclaration(value)).toEqual({
      error: `robkit must be an object, such as {"access": {"kind": "open"}, "icon": "📝"}, or left out.`,
    });
  });

  it.each([
    null,
    "open",
    { kind: "everyone" },
    { kind: "roles" },
    { kind: "roles", roles: [] },
    { kind: "roles", roles: [""] },
    { kind: "roles", roles: [1] },
  ])("refuses the access %j", (access) => {
    expect(readAppDeclaration({ access })).toEqual({
      error: `robkit.access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.`,
    });
  });

  it.each([
    "📝",
    "📦",
    "🧪",
    // A skin tone, a family joined by zero-width joiners, a flag, a keycap
    // and a heart with its emoji presentation selector are each one emoji.
    "👍🏽",
    "👨‍👩‍👧",
    "🇬🇧",
    "1️⃣",
    "❤️",
  ])("reads the icon %s", (icon) => {
    expect(readAppDeclaration({ icon })).toEqual({ icon });
  });

  it.each([
    null,
    1,
    "",
    "x".repeat(17),
    "x",
    "1",
    "#",
    "📝📝",
    "📝 ",
    " 📝",
    "a📝",
    "🇬🇧🇫🇷",
    "‍",
    "️",
  ])("refuses the icon %j", (icon) => {
    expect(readAppDeclaration({ icon })).toEqual({
      error: `robkit.icon must be one emoji, such as "📝".`,
    });
  });

  it("names the field it was given", () => {
    expect(readAppDeclaration({ icon: 1 }, "ROBKIT_APPS[0]")).toEqual({
      error: `ROBKIT_APPS[0].icon must be one emoji, such as "📝".`,
    });
  });

  it("writes them back as a manifest holds them", () => {
    expect(
      appDeclarationJson({
        access: { kind: "roles", roleNames: ["Family"] },
        icon: "📝",
      }),
    ).toEqual({ access: { kind: "roles", roles: ["Family"] }, icon: "📝" });
    expect(appDeclarationJson({ access: { kind: "owner" } })).toEqual({
      access: { kind: "owner" },
    });
  });
});

describe("readDeclaredApp", () => {
  it("reads an app and what it declares", () => {
    expect(
      readDeclaredApp(
        { slug: "notes", access: { kind: "open" } },
        "ROBKIT_APPS[0]",
      ),
    ).toEqual({ slug: "notes", access: { kind: "open" } });
  });

  it.each([null, [], "notes"])("refuses %j", (value) => {
    expect(readDeclaredApp(value, "ROBKIT_APPS[0]")).toEqual({
      error: `ROBKIT_APPS[0] must be an object with the app's slug, such as {"slug": "notes"}.`,
    });
  });

  it("refuses an app without a slug", () => {
    expect(
      readDeclaredApp({ access: { kind: "open" } }, "ROBKIT_APPS[2]"),
    ).toEqual({
      error: `ROBKIT_APPS[2].slug: Nothing can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });
});
