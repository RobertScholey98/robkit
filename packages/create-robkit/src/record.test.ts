import { describe, expect, it } from "vitest";
import { movedAppRepos } from "./record.ts";

describe("movedAppRepos", () => {
  it("names each app repo whose recorded commit changed, new ones included", () => {
    const before = {
      exampleStack: "start" as const,
      apps: {
        kept: { source: "/r/kept.git", revision: "aaa" },
        moved: { source: "/r/moved.git", revision: "bbb" },
      },
    };
    const after = {
      exampleStack: "start" as const,
      apps: {
        kept: { source: "/r/kept.git", revision: "aaa" },
        moved: { source: "/r/moved.git", revision: "ccc" },
        added: { source: "/r/added.git", revision: "ddd" },
      },
    };

    expect(movedAppRepos(before, after)).toEqual(["moved", "added"]);
  });

  it("names every app repo when there's nothing to compare with", () => {
    expect(
      movedAppRepos(undefined, {
        exampleStack: "start",
        apps: { notes: { source: "/r/notes.git", revision: "aaa" } },
      }),
    ).toEqual(["notes"]);
  });
});
