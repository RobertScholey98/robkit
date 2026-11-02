import { describe, expect, it } from "vitest";
import { choicesFromFlags } from "./choices.ts";

describe("choicesFromFlags", () => {
  it("takes the default for every flag left out", () => {
    expect(choicesFromFlags({})).toEqual({
      packageManager: "pnpm",
      orm: "drizzle",
      uiKit: null,
      tools: ["eslint-prettier"],
      generators: ["start", "react-hono"],
    });
  });

  it("keeps the generators in the order given", () => {
    expect(
      choicesFromFlags({ generators: "react-hono,start" }).generators,
    ).toEqual(["react-hono", "start"]);
    expect(choicesFromFlags({ generators: "react-hono" }).generators).toEqual([
      "react-hono",
    ]);
  });

  it("names the options when a flag's value isn't one", () => {
    expect(() => choicesFromFlags({ pm: "npm" })).toThrow(
      "--pm npm isn't an option. Choose from: pnpm.",
    );
    expect(() => choicesFromFlags({ generators: "start,next" })).toThrow(
      "--generators next isn't an option. Choose from: start, react-hono.",
    );
    expect(() => choicesFromFlags({ generators: "" })).toThrow(
      "--generators  isn't an option. Choose from: start, react-hono.",
    );
  });

  it("refuses an option named twice", () => {
    expect(() => choicesFromFlags({ generators: "start,start" })).toThrow(
      "--generators start,start names an option twice.",
    );
  });
});
