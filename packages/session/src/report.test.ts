import { afterEach, describe, expect, it, vi } from "vitest";
import { reportToConsole } from "./report.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportToConsole", () => {
  it("prints the message, then the cause on its own", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("connect ECONNREFUSED");

    reportToConsole("GET /status failed.", cause);

    expect(log.mock.calls).toEqual([["GET /status failed."], [cause]]);
  });

  it("prints a message with no cause alone", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportToConsole("Set COOLIFY_TOKEN to deploy.");

    expect(log.mock.calls).toEqual([["Set COOLIFY_TOKEN to deploy."]]);
  });
});
