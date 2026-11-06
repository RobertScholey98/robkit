import { afterEach, describe, expect, it, vi } from "vitest";
import { stopGroup } from "./process-group.ts";

/** A system error with `code`, as `process.kill` throws. */
function systemError(code: string): Error {
  return Object.assign(new Error(`kill ${code}`), { code });
}

/**
 * A stand-in for `process.kill` that records each signal and answers it
 * from `answers`: a code to throw, or nothing to succeed.
 */
function fakeKill(answers: Partial<Record<string, string>>) {
  const sent: [number, string | number | undefined][] = [];
  const kill = (pid: number, signal?: string | number): true => {
    sent.push([pid, signal]);
    const code = answers[String(signal)];
    if (code) throw systemError(code);
    return true;
  };
  return { kill, sent };
}

describe("stopGroup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing for an app that never started", async () => {
    const { kill, sent } = fakeKill({});

    await stopGroup("alpha", undefined, kill);

    expect(sent).toEqual([]);
  });

  it("treats a group that's already gone as stopped", async () => {
    const { kill, sent } = fakeKill({ SIGTERM: "ESRCH" });

    await stopGroup("alpha", 42, kill);

    expect(sent).toEqual([[-42, "SIGTERM"]]);
  });

  it("waits for the group to go after SIGTERM", async () => {
    const { kill, sent } = fakeKill({ 0: "ESRCH" });

    await stopGroup("alpha", 42, kill);

    expect(sent).toEqual([
      [-42, "SIGTERM"],
      [-42, 0],
    ]);
  });

  it("kills a group that outlives SIGTERM by five seconds", async () => {
    vi.useFakeTimers();
    const { kill, sent } = fakeKill({});

    const stopping = stopGroup("alpha", 42, kill);
    await vi.advanceTimersByTimeAsync(4950);
    expect(sent).not.toContainEqual([-42, "SIGKILL"]);
    await vi.advanceTimersByTimeAsync(50);
    await stopping;

    expect(sent[0]).toEqual([-42, "SIGTERM"]);
    expect(sent.at(-1)).toEqual([-42, "SIGKILL"]);
  });

  it.each([
    ["SIGTERM", { SIGTERM: "EPERM" }],
    ["the check that it's gone", { 0: "EPERM" }],
  ])(
    "rethrows anything but ESRCH from %s, with its cause",
    async (_, answers) => {
      const { kill } = fakeKill(answers);

      const stopping = stopGroup("alpha", 42, kill);

      await expect(stopping).rejects.toThrow(
        "Couldn't stop alpha's processes (group 42).",
      );
      await expect(stopping).rejects.toHaveProperty("cause.code", "EPERM");
    },
  );
});
