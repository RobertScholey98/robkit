import { describe, expect, it } from "vitest";
import { introCode } from "./intro-link.ts";

describe("introCode", () => {
  it.each([
    ["http://hub.robkit.localhost:3000/i/K7XQ2", "K7XQ2"],
    ["https://hub.example.com/i/grandma2026/", "grandma2026"],
    ["https://hub.example.com/i/K7XQ2?next=x", "K7XQ2"],
  ])("reads the code in %s", (page, code) => {
    expect(introCode(page)).toBe(code);
  });

  it.each([
    "https://hub.example.com/",
    "https://hub.example.com/i/",
    "https://hub.example.com/i/K7XQ2/more",
    "https://hub.example.com/x/K7XQ2",
    "https://hub.example.com/?code=K7XQ2",
  ])("finds no code in %s", (page) => {
    expect(introCode(page)).toBeUndefined();
  });
});
