import { aCodeId, aRoleId } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import { roleViews } from "./roles.ts";

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
