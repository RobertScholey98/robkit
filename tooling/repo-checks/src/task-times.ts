// Reading how long turbo took over each test task, from its run summary.
// print-test-times.ts prints them for CI.
import { isRecord, type InputProblem } from "@robkit/session/input";

/** A task turbo ran, and how long it took. */
export interface TaskTime {
  task: string;
  ms: number;
  cached: boolean;
}

/** The test tasks in a turbo run summary, or what's wrong with it. */
export function readTestTimes(
  json: unknown,
  source: string,
): TaskTime[] | InputProblem {
  const tasks = isRecord(json) ? json.tasks : undefined;
  if (!Array.isArray(tasks)) {
    return { error: `${source} has no list of tasks.` };
  }
  const times: TaskTime[] = [];
  for (const task of tasks) {
    const id = isRecord(task) ? task.taskId : undefined;
    const execution = isRecord(task) ? task.execution : undefined;
    const cache = isRecord(task) ? task.cache : undefined;
    const start = isRecord(execution) ? execution.startTime : undefined;
    const end = isRecord(execution) ? execution.endTime : undefined;
    if (
      typeof id !== "string" ||
      typeof start !== "number" ||
      typeof end !== "number"
    ) {
      return { error: `${source} has a task without its id and times.` };
    }
    if (!id.endsWith("#test")) continue;
    const cached = isRecord(cache) && cache.status === "HIT";
    times.push({ task: id, ms: end - start, cached });
  }
  return times.sort((a, b) => b.ms - a.ms);
}

/** `ms` as minutes and seconds, such as `3m 05s`, or seconds alone. */
export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60);
  return minutes === 0
    ? `${rest}s`
    : `${String(minutes)}m ${rest.padStart(2, "0")}s`;
}

/** The times as a Markdown table, for a job summary. */
export function timesTable(times: readonly TaskTime[]): string {
  return [
    "### Test times",
    "",
    "| Task | Time |",
    "| --- | --- |",
    ...times.map(
      ({ task, ms, cached }) =>
        `| ${task} | ${cached ? "cached" : duration(ms)} |`,
    ),
    "",
  ].join("\n");
}
