import { fakeCore, unreachable } from "@internal/core-client/fake-core";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listCodes", () => {
  it("reads every code core lists", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /codes": () => ({ body: { codes: [sent] } }) }),
    );

    expect(await listCodes(core)).toEqual({ outcome: "ok", value: [read] });
  });

  it("passes on core's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "GET /codes": () => ({ status: 403, body: { error: "Owner only." } }),
      }),
    );

    expect(await listCodes(core)).toEqual({
      outcome: "failed",
      error: "Owner only.",
    });
  });

  it.each([
    ["an unknown standing", { codes: [{ ...sent, standing: "asleep" }] }],
    ["a code without a name", { codes: [{ ...sent, name: undefined }] }],
    ["a date that isn't one", { codes: [{ ...sent, createdAt: "soon" }] }],
    ["no list", {}],
  ])("refuses %s", async (_, body) => {
    vi.stubGlobal("fetch", fakeCore(core, { "GET /codes": () => ({ body }) }));

    expect(await listCodes(core)).toEqual({
      outcome: "failed",
      error: "Core sent an answer this page can't read.",
    });
  });
});

describe("mintCode", () => {
  // Core mints what it's sent, as a live code.
  const mints = fakeCore(core, {
    "POST /codes": ({ body }) => ({
      status: 201,
      body: {
        ...sent,
        expiresAt: null,
        ...(body as object),
      },
    }),
  });

  it("sends the guest's name, code and expiry, and reads the new code", async () => {
    vi.stubGlobal("fetch", mints);

    expect(
      await mintCode(core, {
        name: "Grandma",
        code: "K7XQ2",
        expiresAt: read.expiresAt,
      }),
    ).toEqual({ outcome: "ok", value: read });
  });

  it("leaves out a code and expiry the owner didn't give", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /codes": ({ body }) => ({
          status: 201,
          body: { ...sent, name: JSON.stringify(body) },
        }),
      }),
    );

    const result = await mintCode(core, { name: "Grandma" });

    expect(result.outcome === "ok" && result.value.name).toBe(
      '{"name":"Grandma"}',
    );
  });

  it("passes on a taken code as core's sentence", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /codes": () => ({
          status: 409,
          body: { error: "That code is taken." },
        }),
      }),
    );

    expect(await mintCode(core, { name: "Grandma", code: "TEST" })).toEqual({
      outcome: "failed",
      error: "That code is taken.",
    });
  });
});

describe("revokeCode", () => {
  it("revokes the code by its id", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /codes/c%2F1/revoke": () => new Response(null, { status: 204 }),
      }),
    );

    expect(await revokeCode(core, "c/1")).toEqual({
      outcome: "ok",
      value: undefined,
    });
  });

  it("passes on core's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /codes/c_9/revoke": () => ({
          status: 404,
          body: { error: "There's no such code." },
        }),
      }),
    );

    expect(await revokeCode(core, "c_9")).toEqual({
      outcome: "failed",
      error: "There's no such code.",
    });
  });
});

describe("every call", () => {
  it.each([
    ["listCodes", () => listCodes(core)],
    ["mintCode", () => mintCode(core, { name: "Grandma" })],
    ["revokeCode", () => revokeCode(core, "c_1")],
  ])("%s says when core can't be reached", async (_, call) => {
    vi.stubGlobal("fetch", unreachable);

    expect(await call()).toEqual({
      outcome: "failed",
      error: "Couldn't reach core at https://core.example.com.",
    });
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
