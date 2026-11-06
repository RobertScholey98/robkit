import { fakeCore, unreachable } from "@internal/core-client/fake-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listLauncherApps } from "./launcher-api.ts";

const core = "https://core.example.com";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listLauncherApps", () => {
  it("reads the apps core lists for the viewer", async () => {
    const apps = [
      { slug: "example", name: "Example", icon: null },
      { slug: "notes", name: "Notes", icon: "📝" },
    ];
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /launcher": () => ({ body: { apps } }) }),
    );

    expect(await listLauncherApps(core)).toEqual({ ok: true, value: apps });
  });

  it.each([
    [500, { error: "Down" }, "Down"],
    [200, { apps: [{ slug: 1 }] }, "Core sent an answer this page can't read."],
    [
      200,
      { apps: [{ slug: "Notes", name: "Notes", icon: null }] },
      "Core sent an answer this page can't read.",
    ],
    [
      200,
      { apps: [{ slug: "notes", name: "Notes", icon: 7 }] },
      "Core sent an answer this page can't read.",
    ],
  ])(
    "says what went wrong when core answers %i",
    async (status, body, error) => {
      vi.stubGlobal(
        "fetch",
        fakeCore(core, { "GET /launcher": () => ({ status, body }) }),
      );

      expect(await listLauncherApps(core)).toEqual({ ok: false, error });
    },
  );

  it("says when core can't be reached", async () => {
    vi.stubGlobal("fetch", unreachable);

    expect(await listLauncherApps(core)).toEqual({
      ok: false,
      error: `Couldn't reach core at ${core}.`,
    });
  });
});
