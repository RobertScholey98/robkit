// The one type for a failed read, and the checks every reader shares. See
// docs/conventions/input.md.

// Symbol.for, so a problem made by one copy of this package still passes
// another copy's isProblem, such as when an install resolves the guard's
// @robkit/input apart from its app's.
const problemMark: unique symbol = Symbol.for("@robkit/input.InputProblem");

/**
 * Why some input won't do: where it is, what's wrong, and what to do. Only
 * {@link problem} makes one, so a value that merely has an `error` field,
 * such as a JSON body, is never taken for one.
 */
export interface InputProblem {
  readonly error: string;
  readonly [problemMark]: true;
}

/** A problem saying `message`, which names the input and how to fix it. */
export function problem(message: string): InputProblem {
  const made: InputProblem = { error: message, [problemMark]: true };
  // Hide the mark from enumeration, so a problem prints, compares and
  // serialises as its `{ error }` alone.
  return Object.defineProperty(made, problemMark, { enumerable: false });
}

export function isProblem(value: unknown): value is InputProblem {
  return isRecord(value) && problemMark in value && value[problemMark] === true;
}

/** Whether `value` is a plain object: not `null`, and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every problem among `reads` as one, a line each. */
export function allProblems(...reads: unknown[]): InputProblem {
  return problem(
    reads
      .filter(isProblem)
      .map((read) => read.error)
      .join("\n"),
  );
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
