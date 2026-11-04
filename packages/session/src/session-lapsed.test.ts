import { describe, expect, it } from "vitest";
import {
  readSessionLapsed,
  sessionLapsedHeader,
  sessionLapsedResponse,
  type SessionLapsed,
} from "./session-lapsed.ts";

const refresh: SessionLapsed = {
  outcome: "refresh",
  error: "Your session needs refreshing.",
  location: "http://core.robkit.localhost:3000/refresh",
};

describe("the guard's 401 for a lapsed session", () => {
  it("reads back as what the guard said", async () => {
    const res = sessionLapsedResponse(refresh);

    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await readSessionLapsed(res)).toEqual(refresh);
  });

  it("leaves the body for the caller to read", async () => {
    const res = sessionLapsedResponse(refresh);

    await readSessionLapsed(res);

    expect(await res.json()).toEqual({
      error: refresh.error,
      location: refresh.location,
    });
  });

  it("isn't an app's own 401, even shaped like the guard's", async () => {
    const own = Response.json(
      {
        error: "Ask the owner.",
        location: "http://hub.robkit.localhost:3000/",
      },
      { status: 401 },
    );

    expect(await readSessionLapsed(own)).toBeUndefined();
  });

  it("isn't an answer with the header but another status or body", async () => {
    const headers = { [sessionLapsedHeader]: "login" };
    const answers = [
      Response.json(
        { error: "x", location: "http://hub.x/" },
        { status: 403, headers },
      ),
      new Response("Sign in", { status: 401, headers }),
      Response.json(
        { error: "x", location: "not a URL" },
        { status: 401, headers },
      ),
      Response.json(
        { error: "x", location: "http://hub.x/" },
        { status: 401, headers: { [sessionLapsedHeader]: "elsewhere" } },
      ),
    ];

    const read = await Promise.all(answers.map(readSessionLapsed));

    expect(read).toEqual([undefined, undefined, undefined, undefined]);
  });
});
