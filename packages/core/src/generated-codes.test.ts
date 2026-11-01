import { describe, expect, it, vi } from "vitest";
import { claim, freshCore, postJson } from "./test/fresh-app.ts";

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
    const cookie = { cookie: `robkit_session=${owner}` };
    await postJson(app, "/codes", { name: "Gran", code: "AAAAA" }, cookie);
    picks.push(0, 0, 0, 0, 0, 1, 1, 1, 1, 1);

    const res = await postJson(app, "/codes", { name: "Bob" }, cookie);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ code: "BBBBB", name: "Bob" });
  });
});
