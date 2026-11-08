import { describe, expect, it } from "vitest";
import { conformanceCases, readConformanceCases } from "./conformance.ts";

describe("readConformanceCases", () => {
  it("reads the shared cases", () => {
    expect(conformanceCases.length).toBeGreaterThan(0);
  });

  it("reads a case with every field", () => {
    const row = {
      name: "a guest with the role gets in",
      rule: { kind: "roles", roles: ["r1"] },
      session: "guest",
      guestRoles: ["r1"],
      otherToken: "core",
      outcome: "allow",
    };
    expect(readConformanceCases([row])).toEqual([row]);
  });

  it.each([
    [null, "conformance.json must be a list of cases, but it holds null."],
    [{}, "conformance.json must be a list of cases, but it holds an object."],
    ["x", "conformance.json must be a list of cases, but it holds a string."],
    [[null], "conformance.json[0] must be an object."],
    [
      [
        {
          name: "x",
          rule: { kind: "everyone" },
          session: "guest",
          outcome: "allow",
        },
      ],
      'conformance.json[0] (x): rule must be an access rule, such as {"kind": "open"}.',
    ],
    [
      [
        {
          name: "x",
          rule: { kind: "open" },
          session: "visitor",
          outcome: "allow",
        },
      ],
      "conformance.json[0] (x): session must be one of unknown, signed-out, expired, owner, guest.",
    ],
    [
      [
        {
          name: "x",
          rule: { kind: "open" },
          session: "guest",
          outcome: "maybe",
        },
      ],
      "conformance.json[0] (x): outcome must be one of allow, login, refresh, not-found.",
    ],
    [
      [{ rule: { kind: "open" }, session: "guest", outcome: "allow" }],
      "conformance.json[0] needs a name.",
    ],
    [
      [
        {
          name: "x",
          rule: { kind: "open" },
          session: "guest",
          guestRoles: [1],
          outcome: "allow",
        },
      ],
      "conformance.json[0] (x): guestRoles must be a list of role ids, or left out.",
    ],
    [
      [
        {
          name: "x",
          rule: { kind: "open" },
          session: "unknown",
          otherToken: "mine",
          outcome: "allow",
        },
      ],
      "conformance.json[0] (x): otherToken must be one of another-app, core, no-audience, or left out.",
    ],
  ])("refuses %j", (value, message) => {
    expect(() => readConformanceCases(value)).toThrow(message);
  });
});
