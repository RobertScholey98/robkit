import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPage, readPages } from "./pages.ts";
import { repoRoot } from "./repo.ts";

const file = "site/src/content/docs/get-started/a.mdx";

describe("readPage", () => {
  it("reads a page's front matter, with its id from its path", () => {
    expect(
      readPage(
        "---\ntitle: A\ndescription: x\nstub: true\n---\n\nText.\n",
        file,
      ),
    ).toEqual({
      file,
      id: "get-started/a",
      title: "A",
      stub: true,
    });
  });

  it("reads a page with Windows line ends and nothing optional", () => {
    expect(readPage("---\r\ntitle: A\r\n---\r\n", file)).toMatchObject({
      stub: false,
    });
  });

  it.each([
    ["Text.\n", "has no front matter"],
    ["---\n- a\n---\n", "has no title"],
    ["---\nplain\n---\n", "isn't a set of fields"],
    ["---\ntitle: A\nstub: yes please\n---\n", 'stub is "yes please"'],
  ])("names the file when %j is wrong", (text, problem) => {
    expect(() => readPage(text, file)).toThrow(file);
    expect(() => readPage(text, file)).toThrow(problem);
  });
});

const pages = await readPages();
const built = (id: string) =>
  readFile(join(repoRoot, "site", "dist", "docs", id, "index.html"), "utf8");
const stubs = pages.filter(({ stub }) => stub);

describe("the built docs pages", () => {
  // Ticket 26 turns this into a failure on any stub left.
  describe(`the site's ${String(stubs.length)} stubs`, () => {
    it.each(stubs.map(({ id }) => id))(
      "%s says it isn't written yet",
      async (id) => {
        expect(await built(id)).toContain("This page isn't written yet.");
      },
    );

    it("are the only pages that say so", async () => {
      for (const { id } of pages.filter(({ stub }) => !stub)) {
        expect(await built(id)).not.toContain("This page isn't written yet.");
      }
    });
  });
});
