import { describe, expect, it } from "vitest";
import { readCredentials, readNewOwner } from "./owner.ts";

describe("readCredentials", () => {
  it("trims the username and keeps the password as sent", () => {
    expect(
      readCredentials({ username: " rob ", password: " secret " }),
    ).toEqual({ username: "rob", password: " secret " });
  });

  it.each([
    {},
    { username: "rob" },
    { password: "secret" },
    { username: 1, password: "secret" },
  ])("refuses %j", (fields) => {
    expect(readCredentials(fields)).toEqual({
      error: "Send a username and a password.",
    });
  });
});

describe("readNewOwner", () => {
  const password = "correct horse";

  it("takes a username of 1 to 64 characters and a password of 12 or more", () => {
    expect(readNewOwner({ username: "r", password })).toEqual({
      username: "r",
      password,
    });
    expect(
      readNewOwner({ username: "r".repeat(64), password: "x".repeat(12) }),
    ).toEqual({ username: "r".repeat(64), password: "x".repeat(12) });
  });

  it.each([
    [{ username: "  ", password }, "Pick a username of 1 to 64 characters."],
    [
      { username: "r".repeat(65), password },
      "Pick a username of 1 to 64 characters.",
    ],
    [
      { username: "rob", password: "x".repeat(11) },
      "Pick a password of at least 12 characters.",
    ],
    [{ username: "rob" }, "Send a username and a password."],
  ])("refuses %j", (fields, error) => {
    expect(readNewOwner(fields)).toEqual({ error });
  });
});
