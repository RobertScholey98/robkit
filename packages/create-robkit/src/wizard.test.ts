import { describe, expect, it } from "vitest";
import { commandFor } from "./wizard.ts";

describe("commandFor", () => {
  it("quotes a folder with a space and asks for the install", () => {
    expect(
      commandFor({
        folder: "family apps",
        pm: "pnpm",
        orm: "drizzle",
        generators: "start",
        tools: "none",
        install: true,
      }),
    ).toBe(
      `npm create robkit@latest "family apps" -- --pm pnpm --orm drizzle --generators start --tools none --install`,
    );
  });
});
