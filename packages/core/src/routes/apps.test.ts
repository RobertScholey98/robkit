import { aCoreOrigin } from "@internal/test-session";
import { freePort } from "@internal/test-postgres";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createApp } from "../app.ts";
import { createDatabase } from "../database.ts";

/** Core over a database nothing listens for, so any query fails. */
async function coreWithoutDatabase() {
  const db = createDatabase(
    `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
  );
  onTestFinished(() => db.$client.end());
  const logError = vi.fn();
  return { app: createApp({ db, origin: aCoreOrigin(), logError }), logError };
}

describe("GET /apps/:slug/access", () => {
  it.each(["Notes", "my-app", "a.b", "%20"])(
    "answers 404 for %s, which can't be a slug, without asking the database",
    async (name) => {
      const { app, logError } = await coreWithoutDatabase();

      const res = await app.request(`/apps/${name}/access`);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
      expect(logError).not.toHaveBeenCalled();
    },
  );
});
