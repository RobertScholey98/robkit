import { CommandProblem } from "@robkit/dev/cli";
import { slug } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import { afterAdd, afterMigrate } from "./dev-answers.ts";

const notes = slug("notes");
const origin = "http://notes.robkit.localhost:3000";

describe("afterAdd", () => {
  it("prints the address pnpm dev started the app at", () => {
    expect(
      afterAdd(
        notes,
        {
          outcome: "done",
          message:
            "pnpm dev started notes at http://notes.robkit.localhost:3004.",
        },
        { hasDependencies: true, origin },
      ),
    ).toBe(
      "Added apps/notes. pnpm dev started notes at http://notes.robkit.localhost:3004.",
    );
  });

  it("says to start pnpm dev when none is running", () => {
    expect(
      afterAdd(
        notes,
        { outcome: "not-running" },
        { hasDependencies: true, origin },
      ),
    ).toBe(`Added apps/notes. Next:

  pnpm dev

Then open http://notes.robkit.localhost:3000.`);
  });

  it("says to install first in an install with no dependencies", () => {
    expect(
      afterAdd(
        notes,
        { outcome: "not-running" },
        { hasDependencies: false, origin },
      ),
    ).toBe(`Added apps/notes. Next:

  pnpm install
  pnpm dev

Then open http://notes.robkit.localhost:3000.`);
  });

  it("refuses with pnpm dev's problem, and how to start the app", () => {
    expect(() =>
      afterAdd(
        notes,
        {
          outcome: "refused",
          message: "notes exited with 1 before it answered.",
        },
        { hasDependencies: true, origin },
      ),
    ).toThrow(
      new CommandProblem(`Added apps/notes, but pnpm dev couldn't start it:

  notes exited with 1 before it answered.

Fix that, then stop pnpm dev and start it again, which starts every app in apps/.`),
    );
  });
});

describe("afterMigrate", () => {
  it("prints pnpm dev's answer", () => {
    expect(
      afterMigrate({ outcome: "done", message: "pnpm dev migrated notes." }),
    ).toBe("pnpm dev migrated notes.");
  });

  it("says pnpm dev migrates as it starts when none is running", () => {
    expect(afterMigrate({ outcome: "not-running" })).toBe(
      "No pnpm dev is running in this install. Start it with pnpm dev, which migrates every app as it starts.",
    );
  });

  it("refuses with pnpm dev's problem", () => {
    expect(() =>
      afterMigrate({
        outcome: "refused",
        message: "pnpm dev isn't running notes.",
      }),
    ).toThrow(new CommandProblem("pnpm dev isn't running notes."));
  });
});
