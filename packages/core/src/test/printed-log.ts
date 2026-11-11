import { format } from "node:util";
import { onTestFinished, vi } from "vitest";

/**
 * Listens to console.error for the rest of the test, printing nothing.
 *
 * @returns what it has printed so far, each call formatted as the console
 *   formats it: an error with its stack, own fields and causes
 */
export function printedLog(): () => string {
  const lines: string[] = [];
  const spy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      lines.push(format(...args));
    });
  onTestFinished(() => {
    spy.mockRestore();
  });
  return () => lines.join("\n");
}
