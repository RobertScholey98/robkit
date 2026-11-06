// The one type for a failed read, and the checks every reader shares. See
// docs/conventions/input.md.

/** Why some input won't do: where it is, what's wrong, and what to do. */
export interface InputProblem {
  readonly error: string;
}

export function isProblem(value: unknown): value is InputProblem {
  return isRecord(value) && typeof value.error === "string";
}

/** Whether `value` is a plain object: not `null`, and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every problem among `reads` as one, a line each. */
export function allProblems(...reads: unknown[]): InputProblem {
  return {
    error: reads
      .filter(isProblem)
      .map((problem) => problem.error)
      .join("\n"),
  };
}

/**
 * `read`'s value, or its problem thrown as an `Error`. For a place that
 * can't go on without the value, has no better answer and prints what it
 * throws, such as a Vite config. An app's server uses `orExit`.
 */
export function orThrow<T>(read: T | InputProblem): T {
  // eslint-disable-next-line robkit/one-problem-type -- the one place a problem becomes an Error
  if (isProblem(read)) throw new Error(read.error);
  return read;
}
