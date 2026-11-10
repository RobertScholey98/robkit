import { describe, expect, it } from "vitest";
import { guard, readCodeId, readRoleId, type Viewer } from "./index.ts";
import { guest, nobody, owner } from "./testing.ts";

describe("the viewer builders", () => {
  it("builds the owner, owner-1 unless it says", () => {
    expect([owner(), owner("owner-2")]).toEqual([
      { kind: "owner", id: "owner-1" },
      { kind: "owner", id: "owner-2" },
    ]);
  });

  it("builds a guest with roles, by plain strings, as the guard's readers would", () => {
    const built = guest({ id: "code-7", roles: ["family", "friends"] });

    expect(built).toEqual({
      kind: "guest",
      id: readCodeId("code-7"),
      roles: [readRoleId("family"), readRoleId("friends")],
    });
  });

  it("builds a guest with code-1 and no roles unless it says", () => {
    expect(guest()).toEqual({ kind: "guest", id: "code-1", roles: [] });
  });

  it("builds nobody", () => {
    expect(nobody()).toEqual({ kind: "nobody" });
  });

  it("gives viewers the guard decides on as it does on real ones", () => {
    const { roles } = guest({ roles: ["family"] });
    const rule = { kind: "roles" as const, roles };
    const signedIn = (viewer: Exclude<Viewer, { kind: "nobody" }>) =>
      guard(rule, { state: "signed-in", viewer }).outcome;

    expect([
      signedIn(owner()),
      signedIn(guest({ roles: ["family"] })),
      signedIn(guest({ roles: ["friends"] })),
    ]).toEqual(["allow", "allow", "not-found"]);
  });

  it("refuses an id that isn't one, with the guard's reader's problem", () => {
    expect(() => guest({ id: "" })).toThrow(
      `"" isn't an access code's id, which is text that isn't empty.`,
    );
    expect(() => guest({ roles: [""] })).toThrow(
      `"" isn't a role's id, which is text that isn't empty.`,
    );
    expect(() => owner("")).toThrow(
      `"" isn't the owner's id, which is text that isn't empty.`,
    );
  });
});
