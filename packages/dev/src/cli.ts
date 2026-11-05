/**
 * A problem the person running a command can fix, such as a flag it lacks or
 * a folder that isn't an install. Its message says what to do, so the
 * command line prints only that.
 */
export class Problem extends Error {
  override name = "Problem";
}

/** Where a fault robkit didn't expect gets reported. */
export const reportFaultsAt =
  "https://github.com/RobertScholey98/robkit/issues";

/**
 * The one top-level handler of each of robkit's command lines. Runs `main`
 * and returns its exit code. A {@link Problem} prints its message and exits
 * 1. Anything else is a fault in robkit: it prints whole, with its stack and
 * cause, then where to report it, and exits 1.
 *
 * @param print where the lines go, `console.error` by default
 */
export async function runCommand(
  main: () => Promise<number | undefined>,
  print: (...line: unknown[]) => void = console.error,
): Promise<number> {
  try {
    return (await main()) ?? 0;
  } catch (error) {
    if (error instanceof Problem) {
      print(error.message);
    } else {
      print(error);
      print(
        `That's a bug in robkit. Report it at ${reportFaultsAt}, with the output above.`,
      );
    }
    return 1;
  }
}
