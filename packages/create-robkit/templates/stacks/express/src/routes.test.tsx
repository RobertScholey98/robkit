import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Viewer } from "@robkit/express";
import { guardedAs, guest, owner } from "@robkit/express/testing";
import express from "express";
import { describe, expect, it, onTestFinished } from "vitest";
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

/**
 * The app's routes as the server mounts them, with `viewer` asking, on a
 * loopback port. Answers `path` as fetch would, without following a
 * redirect.
 */
async function appAs(viewer: Viewer, visits: Visits) {
  const app = express();
  app.use(guardedAs(viewer));
  app.use(routes(visits));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(() => {
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${String(port)}${path}`, {
      redirect: "manual",
      ...init,
    });
}

describe("the page", () => {
  it("shows the owner who they are and their visits, and records none", async () => {
    const visits = visitsInMemory();
    const ask = await appAs(owner(), visits);

    const res = await ask("/");
    const page = await res.text();

    expect(res.status).toBe(200);
    expect(page).toContain("Signed in as the owner");
    expect(page).toContain(">owner-1</code>");
    expect(page).toContain("Visits: 0");
    expect(visits.recorded).toEqual([]);
  });

  it("records a guest's visit when they press the button, and sends them back to the page", async () => {
    const visits = visitsInMemory();
    const ask = await appAs(guest({ roles: ["family"] }), visits);

    const posted = await ask("/visits", { method: "POST" });
    const page = await (await ask("/")).text();

    expect([posted.status, posted.headers.get("location")]).toEqual([303, "/"]);
    expect(visits.recorded).toEqual(["code-1"]);
    expect(page).toContain("Signed in as a guest");
    expect(page).toContain("Visits: 1");
    expect(page).toContain('<form action="/visits" method="post">');
  });
});
