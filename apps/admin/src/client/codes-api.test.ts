import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expiryAfter,
  introLink,
  listCodes,
  mintCode,
  revokeCode,
} from "./codes-api.ts";

const core = "https://core.example.com";

const sent = {
  id: "c_1",
  code: "K7XQ2",
  name: "Grandma",
  expiresAt: "2026-12-26T00:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-11-01T12:00:00.000Z",
  standing: "live",
};

const read = {
  ...sent,
  expiresAt: new Date("2026-12-26T00:00:00.000Z"),
  createdAt: new Date("2026-11-01T12:00:00.000Z"),
};

function coreAnswers(status: number, body?: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listCodes", () => {
  it("reads every code core lists, with the owner's cookie", async () => {
    const fetch = coreAnswers(200, { codes: [sent] });

    expect(await listCodes(core)).toEqual({ ok: true, value: [read] });
    expect(fetch.mock.calls).toEqual([
      [`${core}/codes`, { method: "GET", credentials: "include" }],
    ]);
  });

  it("passes on core's refusal", async () => {
    coreAnswers(404, { error: "Not found" });

    expect(await listCodes(core)).toEqual({ ok: false, error: "Not found" });
  });

  it.each([
    ["an unknown standing", { codes: [{ ...sent, standing: "asleep" }] }],
    ["a code without a name", { codes: [{ ...sent, name: undefined }] }],
    ["a date that isn't one", { codes: [{ ...sent, createdAt: "soon" }] }],
    ["no list", {}],
  ])("refuses %s", async (_, body) => {
    coreAnswers(200, body);

    expect(await listCodes(core)).toEqual({
      ok: false,
      error: "Core sent an answer admin can't read.",
    });
  });

  it("turns a network failure into an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    expect(await listCodes(core)).toEqual({
      ok: false,
      error: "Couldn't reach core at https://core.example.com.",
    });
  });
});

describe("mintCode", () => {
  it("posts the guest's name, code and expiry, and reads the new code", async () => {
    const fetch = coreAnswers(201, sent);

    expect(
      await mintCode(core, {
        name: "Grandma",
        code: "K7XQ2",
        expiresAt: read.expiresAt,
      }),
    ).toEqual({ ok: true, value: read });
    expect(fetch.mock.calls).toEqual([
      [
        `${core}/codes`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Grandma",
            code: "K7XQ2",
            expiresAt: "2026-12-26T00:00:00.000Z",
          }),
        },
      ],
    ]);
  });

  it("leaves out a code and expiry the owner didn't give", async () => {
    const fetch = coreAnswers(201, { ...sent, expiresAt: null });

    await mintCode(core, { name: "Grandma" });

    expect(fetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ name: "Grandma" }),
    );
  });

  it("passes on a taken code as core's sentence", async () => {
    coreAnswers(409, { error: "That code is taken." });

    expect(await mintCode(core, { name: "Grandma", code: "TEST" })).toEqual({
      ok: false,
      error: "That code is taken.",
    });
  });
});

describe("revokeCode", () => {
  it("posts to the code's revoke address", async () => {
    const fetch = coreAnswers(204);

    expect(await revokeCode(core, "c_1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(fetch.mock.calls).toEqual([
      [
        `${core}/codes/c_1/revoke`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
        },
      ],
    ]);
  });
});

describe("introLink", () => {
  it.each([
    [
      "http://core.robkit.localhost:3000",
      "http://hub.robkit.localhost:3000/i/K7XQ2",
    ],
    ["https://core.example.com", "https://hub.example.com/i/K7XQ2"],
  ])("puts the code on the hub beside %s", (origin, link) => {
    expect(introLink(origin, "K7XQ2")).toBe(link);
  });
});

describe("expiryAfter", () => {
  it("lets a code work through the whole of the day picked, in local time", () => {
    expect(expiryAfter("2026-12-25")).toEqual(new Date(2026, 11, 26));
  });

  it("reads no day as no expiry", () => {
    expect(expiryAfter("")).toBeUndefined();
  });
});
