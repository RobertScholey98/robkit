import { aDomain } from "@internal/test-session";
import { describe, expect, it, vi } from "vitest";
import { mintCode, parseAccessCode } from "./access-codes.ts";
import { claim, freshCore, postJson, withSession } from "./test/fresh-app.ts";

/** The picks `randomInt` makes next; once empty it is random again. */
const picks = vi.hoisted((): number[] => []);

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return {
    ...crypto,
    randomInt: (max: number) => picks.shift() ?? crypto.randomInt(max),
  };
});

describe("a generated code", () => {
  it("is generated again when the first one is taken", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const cookie = withSession(owner);
    await postJson(app, "/codes", { name: "Gran", code: "AAAAA" }, cookie);
    picks.push(0, 0, 0, 0, 0, 1, 1, 1, 1, 1);

    const res = await postJson(app, "/codes", { name: "Bob" }, cookie);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ code: "BBBBB", name: "Bob" });
  });

  it("names the attempts it made when every code it generates is taken", async () => {
    const { db } = await freshCore();
    const now = new Date("2026-11-06T00:00:00Z");
    const taken = parseAccessCode("AAAAA");
    if (!taken) throw new Error("AAAAA must read as an access code.");
    await mintCode(
      db,
      { name: "Gran", code: taken, expiresAt: null },
      now,
      aDomain("robkit.test"),
    );
    picks.push(...Array.from({ length: 25 }, () => 0));

    const minting = mintCode(
      db,
      { name: "Bob", expiresAt: null },
      now,
      aDomain("robkit.test"),
    );

    await expect(minting).rejects.toThrow(
      "Core couldn't find a free access code in 5 attempts: each code it generated was already in core.access_codes.",
    );
  });
});
