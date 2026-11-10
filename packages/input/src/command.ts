import { reportToConsole, type Report } from "./report.ts";

/**
 * A problem the person running a command can fix, such as a flag it lacks or
 * a folder that isn't an install. Its message says what to do, so the
 * command line prints only that.
 */
export class CommandProblem extends Error {
  override name = "CommandProblem";
}

/** Where a fault robkit didn't expect gets reported. */
export const reportFaultsAt =
  "https://github.com/RobertScholey98/robkit/issues";

/**
 * The problems `error` holds: itself, or every failure an AggregateError
 * holds when each is a {@link CommandProblem}. None when any part is a fault.
 */
function problemsIn(error: unknown): CommandProblem[] {
  if (error instanceof CommandProblem) return [error];
  if (
    error instanceof AggregateError &&
    error.errors.length > 0 &&
    error.errors.every((part) => part instanceof CommandProblem)
  ) {
    return error.errors.filter((part) => part instanceof CommandProblem);
  }
  return [];
}

/**
 * The one top-level handler of each of robkit's command lines. Runs `main`
 * and returns its exit code. A {@link CommandProblem} reports its message alone and
 * exits 1, and so do several in an AggregateError, a message each. Anything
 * else is a fault in robkit: it reports that it's a bug and where to report
 * it, with the fault as the cause, so its stack and causes print whole, and
 * exits 1.
 *
 * @param report where the lines go, `reportToConsole` by default
 */
export async function runCommand(
  main: () => Promise<number | undefined>,
  report: Report = reportToConsole,
): Promise<number> {
  try {
    return (await main()) ?? 0;
  } catch (error) {
    const problems = problemsIn(error);
    if (problems.length > 0) {
      for (const problem of problems) report(problem.message);
    } else {
      report(
        `robkit hit a bug. Report it at ${reportFaultsAt}, with the error below.`,
        error,
      );
    }
    return 1;
  }
}
