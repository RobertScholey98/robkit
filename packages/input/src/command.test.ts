import type { Report } from "./report.ts";
import { describe, expect, it } from "vitest";
import { CommandProblem, reportFaultsAt, runCommand } from "./command.ts";

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

  it("reports each of several known problems alone, with no bug line, and exits 1", async () => {
    const result = await run(() =>
      Promise.reject(
        new AggregateError(
          [
            new CommandProblem("Start Docker."),
            new CommandProblem("Free port 3000."),
          ],
          "2 things failed",
        ),
      ),
    );

    expect(result).toEqual({
      code: 1,
      reported: [{ message: "Start Docker." }, { message: "Free port 3000." }],
    });
  });

  it("reports several failures as a bug when any of them is a fault", async () => {
    const failures = new AggregateError(
      [new CommandProblem("Start Docker."), new Error("EACCES")],
      "2 things failed",
    );

    const result = await run(() => Promise.reject(failures));

    expect(result).toEqual({
      code: 1,
      reported: [
        {
          message: `robkit hit a bug. Report it at ${reportFaultsAt}, with the error below.`,
          cause: failures,
        },
      ],
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
