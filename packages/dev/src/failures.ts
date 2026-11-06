/**
 * Runs every step together and waits for them all, so one that fails stops
 * none of the others.
 *
 * @returns what each failed step threw, in the steps' order
 */
export async function failuresOf(steps: (() => unknown)[]): Promise<unknown[]> {
  const results = await Promise.allSettled(
    steps.map(async (step) => {
      await step();
    }),
  );
  return results.flatMap((result): unknown[] =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Throws what failed: one failure as it is, so a `CommandProblem` still prints
 * alone, or several as an AggregateError that names each and keeps each.
 */
export function throwFailures(failures: unknown[]): void {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(
    failures,
    [
      `${String(failures.length)} things failed:`,
      ...failures.map((failure) => `- ${messageOf(failure)}`),
    ].join("\n"),
  );
}
