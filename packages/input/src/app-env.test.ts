import { afterEach, describe, expect, it, vi } from "vitest";
import {
  orExit,
  readDevServerEnv,
  readGuardEnv,
  readServeEnv,
} from "./app-env.ts";
import { isProblem } from "./index.ts";

describe("readServeEnv", () => {
  it("reads where an app listens", () => {
    expect(readServeEnv({ PORT: "3002", HOST: "0.0.0.0" })).toEqual({
      host: "0.0.0.0",
      port: 3002,
    });
    expect(readServeEnv({})).toEqual({ host: "127.0.0.1", port: 3000 });
  });

  it("names every variable that won't do", () => {
    expect(readServeEnv({ PORT: "x", HOST: "http://h" })).toEqual({
      error: [
        `HOST is "http://h", which isn't an address to listen on. Set it to an IP address or host name, such as 0.0.0.0, or leave it unset for 127.0.0.1.`,
        `PORT is "x", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
      ].join("\n"),
    });
  });
});

describe("readGuardEnv", () => {
  it("reads the app's slug and core's origin", () => {
    expect(
      readGuardEnv({
        ROBKIT_APP: "notes",
        ROBKIT_CORE_URL: "https://core.robkit.dev",
      }),
    ).toEqual({ app: "notes", core: "https://core.robkit.dev" });
  });

  it("names every variable that won't do", () => {
    const read = readGuardEnv({});
    expect(isProblem(read) && read.error.split("\n")).toEqual([
      expect.stringMatching(/^ROBKIT_APP is not set/),
      expect.stringMatching(/^ROBKIT_CORE_URL is not set/),
    ]);
  });
});

describe("readDevServerEnv", () => {
  it("reads the port and domain pnpm dev hands Vite, when it does", () => {
    expect(readDevServerEnv({})).toEqual({});
    expect(readDevServerEnv({ PORT: "", ROBKIT_DOMAIN: "" })).toEqual({});
    expect(
      readDevServerEnv({ PORT: "3004", ROBKIT_DOMAIN: "robkit.localhost" }),
    ).toEqual({ port: 3004, domain: "robkit.localhost" });
  });

  it("names every variable that won't do", () => {
    expect(readDevServerEnv({ PORT: "x", ROBKIT_DOMAIN: "a b" })).toEqual({
      error: [
        `PORT is "x", which isn't a port. Set it to a whole number from 1 to 65535.`,
        `ROBKIT_DOMAIN is "a b", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.`,
      ].join("\n"),
    });
  });
});

describe("orExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives back a value that isn't a problem", () => {
    expect(orExit({ host: "127.0.0.1", port: 3000 })).toEqual({
      host: "127.0.0.1",
      port: 3000,
    });
  });

  it("prints a problem alone and ends the process with 1", () => {
    const printed = vi.spyOn(console, "error").mockReturnValue();
    // eslint-disable-next-line robkit/layer -- stands in for the process orExit ends
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`);
    });

    expect(() =>
      orExit({ error: "Set ROBKIT_CORE_URL to core's address." }),
    ).toThrow("exit 1");
    expect(printed.mock.calls).toEqual([
      ["Set ROBKIT_CORE_URL to core's address."],
    ]);
    expect(exit).toHaveBeenCalledOnce();
  });
});
