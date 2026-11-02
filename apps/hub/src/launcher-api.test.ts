import { afterEach, describe, expect, it, vi } from "vitest";
import { listLauncherApps } from "./launcher-api.ts";

const core = "https://core.example.com";

function coreAnswers(status: number, body?: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listLauncherApps", () => {
  it("reads the apps core lists for the viewer, with their cookie", async () => {
    const apps = [{ slug: "example", name: "Example" }];
    const fetch = coreAnswers(200, { apps });

    expect(await listLauncherApps(core)).toEqual({ ok: true, apps });
    expect(fetch.mock.calls).toEqual([
      [`${core}/launcher`, { method: "GET", credentials: "include" }],
    ]);
  });

  it.each([
    [500, { error: "Down" }, "Down"],
    [200, { apps: [{ slug: 1 }] }, "Core sent apps the hub can't read."],
  ])(
    "says what went wrong when core answers %i",
    async (status, body, error) => {
      coreAnswers(status, body);

      expect(await listLauncherApps(core)).toEqual({ ok: false, error });
    },
  );

  it("says when core can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(await listLauncherApps(core)).toEqual({
      ok: false,
      error: `Couldn't reach core at ${core}.`,
    });
  });
});
