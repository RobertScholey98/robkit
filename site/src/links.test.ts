import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brokenLinks } from "./links.ts";
import { repoRoot } from "./repo.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "robkit-links-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Writes a built site of `files`, by path from its root. */
async function site(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
}

describe("brokenLinks", () => {
  it("passes a link to a page, a heading on it and an image", async () => {
    await site({
      "index.html":
        '<a href="/docs/a/">A</a> <a href="/docs/a/#why-it-is">Why</a> <img src="/shot.png" alt=""> <a href="#top">Top</a><h1 id="top">Home</h1>',
      "docs/a/index.html": '<h2 id="why-it-is">Why it is</h2>',
      "shot.png": "",
    });

    expect(await brokenLinks(root)).toEqual([]);
  });

  it("names the page and the link for each that leads nowhere", async () => {
    await site({
      "index.html":
        '<a href="/docs/gone/">Gone</a> <a href="/docs/a/#nowhere">No anchor</a> <img src="/missing.png" alt=""> <a href="#lost">Lost</a> <a href="/shot.png#x">Into an image</a>',
      "shot.png": "",
      "docs/a/index.html":
        '<a href="../b/">Relative</a> <a href="/docs/a/?q=1#here">Query</a><p id="here">',
    });

    expect(await brokenLinks(root)).toEqual([
      { page: "docs/a/index.html", link: "../b/" },
      { page: "index.html", link: "/docs/gone/" },
      { page: "index.html", link: "/docs/a/#nowhere" },
      { page: "index.html", link: "/missing.png" },
      { page: "index.html", link: "#lost" },
      { page: "index.html", link: "/shot.png#x" },
    ]);
  });

  it("reads the links and images in a Markdown copy, but not in its code", async () => {
    await site({
      "docs/a/index.html": '<h2 id="why">Why</h2>',
      "shot.png": "",
      "docs/a.md": [
        "# A",
        "",
        "See [why](/docs/a/#why), [gone](/docs/gone/) and [no anchor](/docs/a/#nowhere).",
        "",
        "![A shot](/shot.png) ![Missing](/missing.png) [GitHub](https://github.com/x)",
        "",
        "Inline `[not](/a/link/)` code.",
        "",
        "```md",
        "[nor](/this/one/)",
        "```",
        "",
      ].join("\n"),
    });

    expect(await brokenLinks(root)).toEqual([
      { page: "docs/a.md", link: "/docs/gone/" },
      { page: "docs/a.md", link: "/docs/a/#nowhere" },
      { page: "docs/a.md", link: "/missing.png" },
    ]);
  });

  it("leaves other origins, mail and data alone", async () => {
    await site({
      "index.html":
        '<a href="https://github.com/x">GitHub</a> <a href="//cdn.example/x">Proto</a> <a href="mailto:a@b.c">Mail</a> <img src="data:image/png;base64,AA" alt="">',
    });

    expect(await brokenLinks(root)).toEqual([]);
  });

  it("reads an escaped ampersand and a percent-escaped anchor", async () => {
    await site({
      "index.html":
        '<a href="/a/?x=1&amp;y=2">Amp</a> <a href="#caf%C3%A9">Café</a><h2 id="café">Café</h2>',
      "a/index.html": "",
    });

    expect(await brokenLinks(root)).toEqual([]);
  });
});

describe("the built site", () => {
  it("has no internal link, anchor or local image that leads nowhere", async () => {
    expect(await brokenLinks(join(repoRoot, "site", "dist"))).toEqual([]);
  });
});
