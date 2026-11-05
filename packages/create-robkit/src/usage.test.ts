import { describe, expect, it } from "vitest";
import { choiceTable, readyOptions, type Choice } from "./choices.ts";
import { usage } from "./usage.ts";

/** The usage text's line for `--flag`, with its wrapped lines joined. */
function lineFor(flag: string): string {
  const start = usage.indexOf(`  --${flag} `);
  const next = usage.indexOf("\n  --", start + 1);
  return usage.slice(start, next).replace(/\s+/g, " ");
}

describe("usage", () => {
  it("lists every choice's ready options, and none coming later", () => {
    const choices: Choice[] = Object.values(choiceTable);
    for (const choice of choices) {
      const line = lineFor(choice.flag);
      for (const option of choice.options) {
        if (option.comingLater) {
          expect(line).not.toContain(option.value);
        } else {
          expect(line).toContain(option.value);
        }
      }
      expect(readyOptions(choice).length).toBeGreaterThan(0);
    }
  });

  it("reads as init's help", () => {
    expect(usage).toBe(`Usage: npm create robkit [folder] -- [options]

With no options, init asks for each one.

  --ui-kit <name>         shared React UI kit: none, shadcn-base-ui,
                          shadcn-radix
  --generators <list>     stacks robkit add offers, the first making the
                          example app: start, react-hono
  --install               install dependencies and initialise git
  --link                  link the @robkit packages to the robkit checkout
                          this runs from, instead of installing them from npm`);
  });
});
