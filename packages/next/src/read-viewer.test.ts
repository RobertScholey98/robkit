import { aCodeId, aRoleId } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import { readViewer } from "./read-viewer.ts";

describe("readViewer", () => {
  it.each([
    { kind: "nobody" },
    { kind: "owner", id: "owner-1" },
    { kind: "guest", id: aCodeId("code-1"), roles: [aRoleId("role-1")] },
  ])("reads $kind", (viewer) => {
    expect(readViewer(JSON.parse(JSON.stringify(viewer)))).toEqual(viewer);
  });

  it("drops what a viewer doesn't hold", () => {
    expect(readViewer({ kind: "nobody", id: "owner-1" })).toEqual({
      kind: "nobody",
    });
  });

  it.each([
    [undefined, 'Nothing isn\'t a viewer, such as {"kind": "nobody"}.'],
    ["owner", '"owner" isn\'t a viewer, such as {"kind": "nobody"}.'],
    [
      { kind: "admin" },
      '{"kind":"admin"} isn\'t a viewer, such as {"kind": "nobody"}.',
    ],
    [
      { kind: "owner" },
      '{"kind":"owner"} isn\'t a viewer, such as {"kind": "nobody"}.',
    ],
    [
      { kind: "owner", id: "" },
      '{"kind":"owner","id":""} isn\'t a viewer, such as {"kind": "nobody"}.',
    ],
    [
      { kind: "guest", id: "code-1" },
      '{"kind":"guest","id":"code-1"} isn\'t a viewer, such as {"kind": "nobody"}.',
    ],
    [
      { kind: "guest", roles: [] },
      '{"kind":"guest","roles":[]} isn\'t a viewer, such as {"kind": "nobody"}.',
    ],
  ])("refuses %j", (value, error) => {
    expect(readViewer(value)).toEqual({ error });
  });
});
