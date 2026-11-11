import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { homeOfItsOwn } from "./home.ts";

describe("homeOfItsOwn", () => {
  it("gives a new home, and keeps caches and settings in the real one", async () => {
    const env = await homeOfItsOwn({ HOME: "/home/r" });

    expect(env.HOME?.startsWith(join(tmpdir(), "robkit-home-"))).toBe(true);
    expect((await stat(env.HOME ?? "")).isDirectory()).toBe(true);
    expect({ ...env, HOME: undefined }).toEqual({
      HOME: undefined,
      XDG_CACHE_HOME: "/home/r/.cache",
      XDG_CONFIG_HOME: "/home/r/.config",
      XDG_DATA_HOME: "/home/r/.local/share",
      XDG_STATE_HOME: "/home/r/.local/state",
      GOPATH: "/home/r/go",
      DOCKER_CONFIG: "/home/r/.docker",
    });
  });

  it("keeps a folder the environment already names", async () => {
    const env = await homeOfItsOwn({
      HOME: "/home/r",
      GOPATH: "/opt/go",
      XDG_CACHE_HOME: "/var/cache/r",
    });

    expect([env.GOPATH, env.XDG_CACHE_HOME]).toEqual([
      "/opt/go",
      "/var/cache/r",
    ]);
  });
});
