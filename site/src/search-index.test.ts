import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeSearchIndex } from "./search-index.ts";

const page = (title: string, prose: string) =>
  `<main><h1>${title}</h1><div class="prose">${prose}</div><footer class="page-foot"></footer></main>`;

async function site(files: Record<string, string>): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), "site-search-"));
  for (const [path, html] of Object.entries(files)) {
    await mkdir(join(dist, path, ".."), { recursive: true });
    await writeFile(join(dist, path), html);
  }
  return dist;
}

describe("writeSearchIndex", () => {
  it("writes search.json from each docs page, in path order, and no other page", async () => {
    const dist = await site({
      "index.html": page("robkit", "<p>The home page.</p>"),
      "samples/index.html": page("Samples", "<p>Every piece.</p>"),
      "404.html": page("Not here", "<p>Missing.</p>"),
      "docs/run-an-install/upgrading/index.html": page(
        "Upgrading",
        "<p>Move to a newer robkit.</p>",
      ),
      "docs/get-started/quickstart/index.html": page(
        "Quickstart",
        '<h2 id="make-an-install">Make an install</h2><p>Run it.</p>',
      ),
      "docs/reference/settings/index.html": page(
        "Every setting",
        '<p class="stub" data-stub>Not yet.</p>',
      ),
    });

    await writeSearchIndex(dist);

    expect(
      JSON.parse(await readFile(join(dist, "search.json"), "utf8")),
    ).toEqual({
      pages: [
        {
          title: "Quickstart",
          sections: [
            {
              heading: "Make an install",
              href: "/docs/get-started/quickstart/#make-an-install",
              text: "Run it.",
            },
          ],
        },
        {
          title: "Upgrading",
          sections: [
            {
              href: "/docs/run-an-install/upgrading/",
              text: "Move to a newer robkit.",
            },
          ],
        },
      ],
    });
  });
});
