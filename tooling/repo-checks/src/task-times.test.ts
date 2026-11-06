import { describe, expect, it } from "vitest";
import { duration, readTestTimes, timesTable } from "./task-times.ts";

/** A task as turbo's run summary records it. */
const task = (taskId: string, ms: number, status = "MISS") => ({
  taskId,
  execution: { startTime: 1_000, endTime: 1_000 + ms, exitCode: 0 },
  cache: { status },
});

describe("readTestTimes", () => {
  it("keeps the test tasks, slowest first", () => {
    expect(
      readTestTimes(
        {
          tasks: [
            task("@robkit/guard#test", 2_000),
            task("@robkit/guard#lint", 9_000),
            task("@internal/e2e#test", 185_000),
            task("@robkit/core#test", 40_000, "HIT"),
          ],
        },
        "run.json",
      ),
    ).toEqual([
      { task: "@internal/e2e#test", ms: 185_000, cached: false },
      { task: "@robkit/core#test", ms: 40_000, cached: true },
      { task: "@robkit/guard#test", ms: 2_000, cached: false },
    ]);
  });

  it.each([
    [{}, "run.json has no list of tasks."],
    [
      { tasks: [{ taskId: "a#test" }] },
      "run.json has a task without its id and times.",
    ],
  ])("refuses %j", (json, error) => {
    expect(readTestTimes(json, "run.json")).toEqual({ error });
  });
});

describe("duration", () => {
  it.each([
    [400, "0s"],
    [59_400, "59s"],
    [65_000, "1m 05s"],
    [185_000, "3m 05s"],
  ])("writes %i ms as %s", (ms, text) => {
    expect(duration(ms)).toBe(text);
  });
});

describe("timesTable", () => {
  it("writes a Markdown table, with cached tasks marked", () => {
    expect(
      timesTable([
        { task: "@internal/e2e#test", ms: 185_000, cached: false },
        { task: "@robkit/core#test", ms: 40_000, cached: true },
      ]),
    ).toBe(
      [
        "### Test times",
        "",
        "| Task | Time |",
        "| --- | --- |",
        "| @internal/e2e#test | 3m 05s |",
        "| @robkit/core#test | cached |",
        "",
      ].join("\n"),
    );
  });
});
