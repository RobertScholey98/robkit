import { describe, expect, it } from "vitest";
import { isProblem } from "@robkit/input";
import {
  find,
  readSearchIndex,
  sectionsOf,
  type SearchIndex,
} from "./search.ts";

/** A built docs page, cut down to what the index reads. */
const page = (prose: string, { stub = false } = {}) => `<!doctype html>
<html><head><title>Ignored | robkit</title></head><body>
<nav id="site-nav"><a href="/docs/x/">Not indexed</a></nav>
<main id="main">
<header class="page-head"><p class="eyebrow">Reference</p><h1>The robkit command</h1></header>
<nav class="toc"><a href="#add">robkit add</a></nav>
<div class="prose">${stub ? '<p class="stub" data-stub>This page isn&#39;t written yet.</p>' : ""}${prose}</div>
<footer class="page-foot"><a href="/edit">Edit this page</a></footer>
</main></body></html>`;

describe("sectionsOf", () => {
  it("splits a page's prose at each h2 and h3, with the text under each", () => {
    const html = page(
      `<p>Each install has a <code>robkit</code> command.</p>
<h2 id="robkit-add">robkit add</h2><p>Adds an app to <code>apps/&lt;name&gt;</code>.</p>
<pre><code><span>pnpm robkit add notes</span></code></pre>
<h3 id="its-options">Its options</h3><ul><li><code>--stack</code>. The stack.</li></ul>`,
    );

    expect(sectionsOf(html, "/docs/reference/robkit-command/")).toEqual({
      title: "The robkit command",
      sections: [
        {
          heading: undefined,
          href: "/docs/reference/robkit-command/",
          text: "Each install has a robkit command.",
        },
        {
          heading: "robkit add",
          href: "/docs/reference/robkit-command/#robkit-add",
          text: "Adds an app to apps/<name>. pnpm robkit add notes",
        },
        {
          heading: "Its options",
          href: "/docs/reference/robkit-command/#its-options",
          text: "--stack. The stack.",
        },
      ],
    });
  });

  it("reads entities and curly quotes as a reader sees them", () => {
    const html = page(
      "<p>It&#39;s &quot;here&quot; &amp; there&#x2019;s more &lt;3 &gt; 2, isn’t it.</p>",
    );

    expect(sectionsOf(html, "/docs/a/")?.sections[0]?.text).toBe(
      `It's "here" & there's more <3 > 2, isn't it.`,
    );
  });

  it("keeps the space before a name that starts with a dot", () => {
    const html = page(
      "<dl><dd>Runs Tailwind.</dd>\n<dt><code>.gitignore</code></dt></dl>",
    );

    expect(sectionsOf(html, "/docs/a/")?.sections[0]?.text).toBe(
      "Runs Tailwind. .gitignore",
    );
  });

  it("leaves out a stub, and a page with no docs prose", () => {
    expect(sectionsOf(page("<p>Soon.</p>", { stub: true }), "/docs/a/")).toBe(
      undefined,
    );
    expect(sectionsOf("<html><body><h1>Home</h1></body></html>", "/")).toBe(
      undefined,
    );
  });

  it("drops a section with no text and no heading", () => {
    const html = page('\n<h2 id="first">First</h2><p>Text.</p>');

    expect(sectionsOf(html, "/docs/a/")?.sections).toEqual([
      { heading: "First", href: "/docs/a/#first", text: "Text." },
    ]);
  });
});

const index: SearchIndex = {
  pages: [
    {
      title: "The robkit command",
      sections: [
        {
          heading: undefined,
          href: "/docs/reference/robkit-command/",
          text: "Each install has a robkit command for its apps.",
        },
        {
          heading: "robkit add",
          href: "/docs/reference/robkit-command/#robkit-add",
          text: "Adds an app to apps/<name>, from a stack's template. pnpm robkit add notes",
        },
      ],
    },
    {
      title: "Every setting",
      sections: [
        {
          heading: "ROBKIT_DOMAIN",
          href: "/docs/reference/settings/#robkit_domain",
          text: "The domain every app is a subdomain of.",
        },
      ],
    },
    {
      title: "Quickstart",
      sections: [
        {
          heading: "Make an install",
          href: "/docs/get-started/quickstart/#make-an-install",
          text: `${"Words before it. ".repeat(10)}Then claim the install in the hub, which takes a minute. ${"Words after it. ".repeat(10)}`,
        },
      ],
    },
  ],
};

describe("find", () => {
  it("finds a command, with the section that has it first", () => {
    const [first] = find(index, "robkit add");

    expect(first).toMatchObject({
      title: "The robkit command",
      heading: "robkit add",
      href: "/docs/reference/robkit-command/#robkit-add",
    });
  });

  it("finds a setting's name in any case", () => {
    expect(find(index, "robkit_domain").map(({ href }) => href)).toEqual([
      "/docs/reference/settings/#robkit_domain",
    ]);
  });

  it("finds a word from a page's text, with an excerpt around it that marks it", () => {
    const [found] = find(index, "Claim");

    expect(found?.href).toBe("/docs/get-started/quickstart/#make-an-install");
    const excerpt = found?.excerpt;
    expect(excerpt?.text.startsWith("…")).toBe(true);
    expect(excerpt?.text.endsWith("…")).toBe(true);
    expect(
      excerpt?.marks.map(([start, end]) => excerpt.text.slice(start, end)),
    ).toEqual(["claim"]);
  });

  it("needs every word, wherever each is", () => {
    expect(find(index, "domain subdomain").map(({ href }) => href)).toEqual([
      "/docs/reference/settings/#robkit_domain",
    ]);
    expect(find(index, "domain nothing")).toEqual([]);
  });

  it("marks every word it found in the excerpt", () => {
    const [found] = find(index, "app stack");

    expect(
      found?.excerpt.marks.map(([start, end]) =>
        found.excerpt.text.slice(start, end),
      ),
    ).toEqual(["app", "app", "stack"]);
  });

  it("gives the start of the text when only the title or heading matches", () => {
    const [found] = find(index, "quickstart");

    expect(found?.excerpt).toEqual({
      text: "Words before it. Words before it. Words before it. Words before it. Words before it. Words before it. Words before it. Words before it. Words before it. Words before it. Then claim the install in the…",
      marks: [],
    });
  });

  it("finds nothing for an empty search, and keeps to the limit", () => {
    expect(find(index, "   ")).toEqual([]);
    expect(find(index, "the", 2)).toHaveLength(2);
  });
});

describe("readSearchIndex", () => {
  it("reads the index the build wrote, as JSON", () => {
    const read = readSearchIndex(JSON.parse(JSON.stringify(index)));

    expect(read).toEqual(index);
  });

  it.each([
    [null, "search.json isn't an object with a pages list"],
    [{ pages: {} }, "search.json isn't an object with a pages list"],
    [{ pages: [{ sections: [] }] }, "search.json's page 1 has no title"],
    [
      { pages: [{ title: "A", sections: "none" }] },
      "search.json's page 1 has no sections list",
    ],
    [
      { pages: [{ title: "A", sections: [{ href: "/a/", text: 3 }] }] },
      "search.json's page 1, section 1, needs an href and text, and a heading only as text",
    ],
    [
      {
        pages: [
          { title: "A", sections: [{ heading: 1, href: "/a/", text: "" }] },
        ],
      },
      "search.json's page 1, section 1, needs an href and text, and a heading only as text",
    ],
  ])("says what's wrong with %j", (value, error) => {
    const read = readSearchIndex(value);

    expect(isProblem(read) && read.error).toBe(
      `${error}. Build the site again to write it.`,
    );
  });
});
