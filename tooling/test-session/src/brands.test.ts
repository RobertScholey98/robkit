import { readCodeId, readRoleId } from "@robkit/guard";
import { describe, expect, it } from "vitest";
import { aCodeId, aRoleId, aViewer } from "./brands.ts";

describe("aCodeId", () => {
  it("builds the code id the guard reads", () => {
    expect(aCodeId("code-7")).toBe(readCodeId("code-7"));
    expect(aCodeId()).toBe("code-1");
  });

  it("throws for a value the guard refuses", () => {
    expect(() => aCodeId("")).toThrow(
      `"" isn't an access code's id, which is text that isn't empty.`,
    );
  });
});

describe("aRoleId", () => {
  it("builds the role id the guard reads", () => {
    expect(aRoleId("family")).toBe(readRoleId("family"));
  });

  it("throws for a value the guard refuses", () => {
    expect(() => aRoleId("")).toThrow(
      `"" isn't a role's id, which is text that isn't empty.`,
    );
  });
});

describe("aViewer", () => {
  it.each([
    [{ kind: "owner" } as const, { kind: "owner", id: "owner-1" }],
    [
      { kind: "owner", id: "owner-2" } as const,
      { kind: "owner", id: "owner-2" },
    ],
    [{ kind: "guest" } as const, { kind: "guest", id: "code-1", roles: [] }],
    [
      { kind: "guest", id: "code-2", roles: ["family", "friends"] } as const,
      { kind: "guest", id: "code-2", roles: ["family", "friends"] },
    ],
    [{ kind: "nobody" } as const, { kind: "nobody" }],
  ])("builds %j", (options, viewer) => {
    expect(aViewer(options)).toEqual(viewer);
  });

  it("throws for a guest with a role the guard refuses", () => {
    expect(() => aViewer({ kind: "guest", roles: [""] })).toThrow(
      `"" isn't a role's id, which is text that isn't empty.`,
    );
  });
});
