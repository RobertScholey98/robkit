import { describe, expect, it } from "vitest";
import { entryProblem } from "./entry.ts";

describe("entryProblem", () => {
  it("takes a name and a message", () => {
    expect(entryProblem("Grandma", "Lovely to see everyone!")).toBeUndefined();
  });

  it.each([
    ["", "Hello", "Write your name."],
    ["Grandma", "  ", "Write a message."],
    ["G".repeat(61), "Hello", "Keep your name under 60 characters."],
    ["Grandma", "x".repeat(501), "Keep your message under 500 characters."],
  ])("refuses %j with %j", (name, message, problem) => {
    expect(entryProblem(name, message)).toBe(problem);
  });
});
