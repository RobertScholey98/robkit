import { describe, expect, it } from "vitest";
import { Problem, reportFaultsAt, runCommand } from "./cli.ts";

/** What `runCommand` printed and returned for `main`. */
async function run(main: () => Promise<number | undefined>) {
  const printed: unknown[][] = [];
  const code = await runCommand(main, (...line) => printed.push(line));
  return { code, printed };
}

describe("runCommand", () => {
  it("returns the command's own exit code", async () => {
    expect(await run(() => Promise.resolve(3))).toEqual({
      code: 3,
      printed: [],
    });
    expect(await run(() => Promise.resolve(undefined))).toEqual({
      code: 0,
      printed: [],
    });
  });

  it("prints a known problem's message alone and exits 1", async () => {
    const result = await run(() =>
      Promise.reject(new Problem("Set COOLIFY_TOKEN to deploy.")),
    );

    expect(result).toEqual({
      code: 1,
      printed: [["Set COOLIFY_TOKEN to deploy."]],
    });
  });

  it("prints an unexpected fault whole, then where to report it, and exits 1", async () => {
    const fault = new Error("Cannot read properties of undefined", {
      cause: new Error("the cause"),
    });

    const result = await run(() => Promise.reject(fault));

    expect(result).toEqual({
      code: 1,
      printed: [
        [fault],
        [
          `That's a bug in robkit. Report it at ${reportFaultsAt}, with the output above.`,
        ],
      ],
    });
  });
});
