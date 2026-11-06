import { aCodeId, aRoleId } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import { readCodeIds, readNewRole, roleViews } from "./roles.ts";

const family = aRoleId("role-family");
const friends = aRoleId("role-friends");
const cooks = aRoleId("role-cooks");
const ada = aCodeId("code-ada");
const bo = aCodeId("code-bo");

describe("roleViews", () => {
  it("gives each role the codes that hold it, in the roles' order", () => {
    const rows = [
      { id: cooks, name: "Cooks" },
      { id: family, name: "Family" },
      { id: friends, name: "Friends" },
    ];
    const memberships = [
      { roleId: family, codeId: ada },
      { roleId: friends, codeId: bo },
      { roleId: family, codeId: bo },
    ];

    expect(roleViews(rows, memberships)).toEqual([
      { id: cooks, name: "Cooks", codeIds: [] },
      { id: family, name: "Family", codeIds: [ada, bo] },
      { id: friends, name: "Friends", codeIds: [bo] },
    ]);
  });

  it("drops a membership of a role it wasn't given", () => {
    expect(
      roleViews(
        [{ id: family, name: "Family" }],
        [{ roleId: cooks, codeId: ada }],
      ),
    ).toEqual([{ id: family, name: "Family", codeIds: [] }]);
  });
});

describe("readCodeIds", () => {
  it("reads a list of code ids", () => {
    expect(readCodeIds({ codeIds: ["code-ada", "code-bo"] })).toEqual({
      codeIds: [ada, bo],
    });
    expect(readCodeIds({ codeIds: [] })).toEqual({ codeIds: [] });
  });

  it.each([
    ["no list", {}],
    ["a string", { codeIds: "code-ada" }],
    ["an empty id", { codeIds: ["code-ada", ""] }],
    ["a number", { codeIds: [1] }],
  ])("refuses %s", (_, fields) => {
    expect(readCodeIds(fields)).toEqual({
      error: "Send codeIds, a list of code ids.",
    });
  });
});

describe("readNewRole", () => {
  it("reads a trimmed name and the codes ticked", () => {
    expect(readNewRole({ name: "  Cooks ", codeIds: ["code-ada"] })).toEqual({
      name: "Cooks",
      codeIds: [ada],
    });
  });

  it.each([
    ["no name", { codeIds: [] }],
    ["a blank name", { name: "   ", codeIds: [] }],
    ["a name over 40 characters", { name: "x".repeat(41), codeIds: [] }],
  ])("refuses %s", (_, fields) => {
    expect(readNewRole(fields)).toEqual({
      error: "Give the role a name of 1 to 40 characters.",
    });
  });

  it("refuses codes that aren't a list of ids", () => {
    expect(readNewRole({ name: "Cooks", codeIds: "code-ada" })).toEqual({
      error: "Send codeIds, a list of code ids.",
    });
  });
});
