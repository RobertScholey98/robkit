import type { Report } from "@robkit/input/report";
import { describe, expect, it } from "vitest";
import { CommandProblem, reportFaultsAt, runCommand } from "./run-command.ts";

/** What `runCommand` reported and returned for `main`. */
async function run(main: () => Promise<number | undefined>) {
  const reported: { message: string; cause?: unknown }[] = [];
  const report: Report = (message, cause) =>
    reported.push(cause === undefined ? { message } : { message, cause });
  const code = await runCommand(main, report);
  return { code, reported };
}

describe("runCommand", () => {
  it("returns the command's own exit code", async () => {
    expect(await run(() => Promise.resolve(3))).toEqual({
      code: 3,
      reported: [],
    });
    expect(await run(() => Promise.resolve(undefined))).toEqual({
      code: 0,
      reported: [],
    });
  });

  it("reports a known problem's message alone and exits 1", async () => {
    const result = await run(() =>
      Promise.reject(
        new CommandProblem("Set COOLIFY_TOKEN to deploy.", {
          cause: new Error("underneath"),
        }),
      ),
    );

    expect(result).toEqual({
      code: 1,
      reported: [{ message: "Set COOLIFY_TOKEN to deploy." }],
    });
  });

  it("reports an unexpected fault as a bug, with the fault as its cause, and exits 1", async () => {
    const fault = new Error("Cannot read properties of undefined", {
      cause: new Error("the cause"),
    });

    const result = await run(() => Promise.reject(fault));

    expect(result).toEqual({
      code: 1,
      reported: [
        {
          message: `robkit hit a bug. Report it at ${reportFaultsAt}, with the error below.`,
          cause: fault,
        },
      ],
    });
  });
});
