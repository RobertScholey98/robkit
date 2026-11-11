import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pageSource, readPage, readPages, type PageFile } from "./pages.ts";
import { repoRoot } from "./repo.ts";
import { editUrl } from "./site.ts";

const file = "site/src/content/docs/get-started/a.mdx";

const page = (id = "a"): PageFile => ({
  file: `site/src/content/docs/${id}.mdx`,
  id,
  title: id,
  stub: false,
  source: undefined,
});

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
      source: undefined,
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
    ["---\ntitle: A\nsource: 3\n---\n", "source isn't a path"],
  ])("names the file when %j is wrong", (text, problem) => {
    expect(() => readPage(text, file)).toThrow(file);
    expect(() => readPage(text, file)).toThrow(problem);
  });
});

describe("pageSource", () => {
  it("is the file a page is built from, or else its own", () => {
    expect(pageSource({ ...page(), source: "GLOSSARY.md" })).toBe(
      "GLOSSARY.md",
    );
    expect(pageSource(page())).toBe("site/src/content/docs/a.mdx");
  });
});

const pages = await readPages();
const built = (id: string) =>
  readFile(join(repoRoot, "site", "dist", "docs", id, "index.html"), "utf8");
const stubs = pages.filter(({ stub }) => stub);

describe("the built docs pages", () => {
  it.each(pages.map((entry) => [entry.id, entry] as const))(
    "%s links to its file on GitHub",
    async (id, entry) => {
      expect(await built(id)).toContain(`href="${editUrl(pageSource(entry))}"`);
      await expect(
        readFile(join(repoRoot, pageSource(entry))),
      ).resolves.toBeDefined();
    },
  );

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
