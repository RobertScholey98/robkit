/** Whether `error` says a file or folder isn't there. */
export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
