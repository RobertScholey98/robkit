import { describe, expect, it } from "vitest";
import { printedOnExit } from "./index.ts";

describe("printedOnExit", () => {
  it("gives what a start printed before it exited with 1", () => {
    expect(
      printedOnExit(() => {
        console.error("ROBKIT_APP is not set.");
        process.exit(1);
      }),
    ).toBe("ROBKIT_APP is not set.");
  });

  it("fails a start that returns", () => {
    expect(() =>
      printedOnExit(() => {
        console.error("nothing wrong");
      }),
    ).toThrow(
      'It returned instead of exiting with 1, and printed: ["nothing wrong"]',
    );
  });

  it("fails a start that exits with another code", () => {
    expect(() =>
      printedOnExit(() => {
        process.exit(2);
      }),
    ).toThrow("process.exit(2)");
  });
});
