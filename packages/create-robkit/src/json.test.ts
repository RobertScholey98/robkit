import { describe, expect, it } from "vitest";
import { jsonObject, stringsIn } from "./json.ts";

describe("jsonObject", () => {
  it("parses an object", () => {
    expect(jsonObject('{"name": "x"}', "package.json")).toEqual({ name: "x" });
  });

  it.each([
    ["{", /^package\.json isn't valid JSON \(.+\)\. Fix its syntax\.$/],
    ["null", /^package\.json must be a JSON object\.$/],
    ["[]", /^package\.json must be a JSON object\.$/],
  ])("refuses %j, naming the file", (text, message) => {
    expect(() => jsonObject(text, "package.json")).toThrow(message);
  });
});

describe("stringsIn", () => {
  it("keeps an object's string values", () => {
    expect(stringsIn({ a: "1", b: 2, c: null })).toEqual({ a: "1" });
  });

  it.each([undefined, null, "x", ["a"]])("reads %j as nothing", (value) => {
    expect(stringsIn(value)).toEqual({});
  });
});
