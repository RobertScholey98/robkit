/** Whether `error` is the system error with one of `codes`, such as `ENOENT`. */
export function hasCode(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

/** Whether `error` says a file or folder isn't there. */
export function isMissing(error: unknown): boolean {
  return hasCode(error, "ENOENT");
}
