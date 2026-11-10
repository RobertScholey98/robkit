import { vi } from "vitest";

/** Stands in for `process.exit`, so a test goes on after it. */
class Exited extends Error {
  readonly code: string | number | null | undefined;

  constructor(code: string | number | null | undefined) {
    super(`process.exit(${String(code)})`);
    this.code = code;
  }
}

/**
 * What `start` printed on standard error as it ended the process with exit
 * code 1, as an app's server does for a setting that won't do. It stands in
 * for `process.exit` and `console.error` while `start` runs. It throws when
 * `start` returns instead, or exits with another code.
 */
export function printedOnExit(start: () => unknown): string {
  const printed: string[] = [];
  const errors = vi.spyOn(console, "error").mockImplementation((...line) => {
    printed.push(line.map(String).join(" "));
  });
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Exited(code);
  });
  try {
    start();
  } catch (error) {
    if (error instanceof Exited && error.code === 1) return printed.join("\n");
    throw error;
  } finally {
    errors.mockRestore();
    exit.mockRestore();
  }
  throw new Error(
    `It returned instead of exiting with 1, and printed: ${JSON.stringify(printed)}`,
  );
}
