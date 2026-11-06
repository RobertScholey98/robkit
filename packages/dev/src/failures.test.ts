import { describe, expect, it } from "vitest";
import { failuresOf, throwFailures } from "./failures.ts";

describe("failuresOf", () => {
  it("runs every step, even after one fails, and returns what failed", async () => {
    const ran: string[] = [];
    const proxy = new Error("the proxy wouldn't close");
    const docker = new Error("docker compose stop exited with 1");

    const failures = await failuresOf([
      () => {
        ran.push("apps");
      },
      () => {
        ran.push("proxy");
        throw proxy;
      },
      async () => {
        ran.push("docker");
        await Promise.resolve();
        throw docker;
      },
    ]);

    expect(ran).toEqual(["apps", "proxy", "docker"]);
    expect(failures).toEqual([proxy, docker]);
  });
});

describe("throwFailures", () => {
  it("does nothing when nothing failed", () => {
    expect(() => {
      throwFailures([]);
    }).not.toThrow();
  });

  it("throws one failure as it is", () => {
    const failure = new Error("docker compose stop exited with 1");

    expect(() => {
      throwFailures([failure]);
    }).toThrow(failure);
  });

  it("throws several together, naming each, with each as a cause", () => {
    const apps = new Error("Couldn't stop alpha's processes (group 42).");
    const docker = new Error("docker compose stop exited with 1");

    let thrown: unknown;
    try {
      throwFailures([apps, docker]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown).toMatchObject({
      message:
        "2 things failed:\n- Couldn't stop alpha's processes (group 42).\n- docker compose stop exited with 1",
      errors: [apps, docker],
    });
  });
});
