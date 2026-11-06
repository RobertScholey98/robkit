// The one type for a failed read, shared by `./input` and `./addresses`. It
// imports nothing, so the browser can load the addresses. See
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
