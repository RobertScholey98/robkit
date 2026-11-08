import { aCodeId, aRoleId } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import {
  claimsFor,
  guardViewerOf,
  needsFreshToken,
  sessionExpiry,
  type Holder,
} from "./session-claims.ts";

const owner: Holder = { profile: { kind: "owner", id: "owner-1" }, roles: [] };
const family = aRoleId("role-family");
const friends = aRoleId("role-friends");
const guest = (roles = [family]): Holder => ({
  profile: { kind: "guest", id: aCodeId("code-1") },
  roles,
});

describe("sessionExpiry", () => {
  it("ends a session 30 days after it starts", () => {
    expect(sessionExpiry(new Date("2026-11-01T12:00:00Z"))).toEqual(
      new Date("2026-12-01T12:00:00Z"),
    );
  });

  it("counts across a leap day", () => {
    expect(sessionExpiry(new Date("2028-02-15T00:00:00Z"))).toEqual(
      new Date("2028-03-16T00:00:00Z"),
    );
  });
});

describe("guardViewerOf", () => {
  it("names the owner by id alone", () => {
    expect(guardViewerOf(owner)).toEqual({ kind: "owner", id: "owner-1" });
  });

  it("names a guest by code id, with their roles", () => {
    expect(guardViewerOf(guest())).toEqual({
      kind: "guest",
      id: "code-1",
      roles: ["role-family"],
    });
  });
});

describe("claimsFor", () => {
  it("puts the session's id in the owner's claims", () => {
    expect(claimsFor(owner, "session-1")).toEqual({
      kind: "owner",
      id: "owner-1",
      sessionId: "session-1",
    });
  });

  it("puts a guest's roles in their claims", () => {
    expect(claimsFor(guest([family, friends]), "session-2")).toEqual({
      kind: "guest",
      id: "code-1",
      sessionId: "session-2",
      roles: ["role-family", "role-friends"],
    });
  });
});

describe("needsFreshToken", () => {
  const read = (holder: Holder, expired = false) => ({
    ...claimsFor(holder, "session-1"),
    expired,
  });

  it("keeps a live token whose holder hasn't changed", () => {
    expect(needsFreshToken(read(owner), owner, false)).toBe(false);
    expect(needsFreshToken(read(guest()), guest(), false)).toBe(false);
  });

  it("renews an expired token", () => {
    expect(needsFreshToken(read(owner, true), owner, false)).toBe(true);
  });

  it("renews any token when asked to", () => {
    expect(needsFreshToken(read(owner), owner, true)).toBe(true);
  });

  it.each([
    ["gains a role", [family, friends]],
    ["loses a role", []],
    ["holds another role", [friends]],
  ])("renews a guest's token when the guest %s", (_, roles) => {
    expect(needsFreshToken(read(guest()), guest(roles), false)).toBe(true);
  });

  it("keeps a guest's token when their roles are the same, in the same order", () => {
    const both = [family, friends];
    expect(needsFreshToken(read(guest(both)), guest([...both]), false)).toBe(
      false,
    );
  });
});
