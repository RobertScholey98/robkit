import type { GuardedEnv, Viewer } from "@robkit/hono";
import { guardedAs, guest, owner } from "@robkit/hono/testing";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { routes } from "./routes.tsx";
import type { Visits } from "./visits.ts";

/** Visits kept in a list, in place of the database. */
function visitsInMemory(): Visits & { recorded: string[] } {
  const recorded: string[] = [];
  return {
    recorded,
    record: (viewerId) => {
      recorded.push(viewerId);
      return Promise.resolve();
    },
    count: (viewerId) =>
      Promise.resolve(recorded.filter((id) => id === viewerId).length),
  };
}

/** The app's routes as the server mounts them, with `viewer` asking. */
function appAs(viewer: Viewer, visits: Visits) {
  const app = new Hono<GuardedEnv>();
  app.use(guardedAs(viewer));
  app.route("/", routes(visits));
  return app;
}

describe("the page", () => {
  it("shows the owner who they are and their visits, and records none", async () => {
    const visits = visitsInMemory();

    const res = await appAs(owner(), visits).request("/");
    const page = await res.text();

    expect(res.status).toBe(200);
    expect(page).toContain("Signed in as the owner");
    expect(page).toContain(">owner-1</code>");
    expect(page).toContain("Visits: 0");
    expect(visits.recorded).toEqual([]);
  });

  it("records a guest's visit when they press the button, and sends them back to the page", async () => {
    const visits = visitsInMemory();
    const app = appAs(guest({ roles: ["family"] }), visits);

    const posted = await app.request("/visits", { method: "POST" });
    const page = await (await app.request("/")).text();

    expect([posted.status, posted.headers.get("location")]).toEqual([303, "/"]);
    expect(visits.recorded).toEqual(["code-1"]);
    expect(page).toContain("Signed in as a guest");
    expect(page).toContain("Visits: 1");
    expect(page).toContain('<form action="/visits" method="post">');
  });
});
