import { describe, expect, it } from "vitest";
import { markdownOf } from "./markdown.ts";

/** Where the page under test is. */
const href = "/docs/get-started/your-first-app/";

const icon =
  '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" class="icon"><path d="M1 1"></path></svg>';

/** A code block as CodeFrame builds it, with `label` in its bar. */
const frame = (lang: string, label: string, lines: string[], command = false) =>
  `<figure class="code"${command ? " data-command" : ""}><figcaption class="bar"><span class="label">${icon}<span>${label}</span></span><button type="button" class="copy" data-copy hidden><span class="copy-icon">${icon}</span><span data-copy-label>Copy</span></button><span class="visually-hidden" role="status" data-copy-status></span></figcaption><pre class="astro-code css-variables" tabindex="0" data-language="${lang}"><code>${lines
    .map(
      (line) =>
        `<span class="line"><span style="color:x">${line}</span></span>`,
    )
    .join("\n")}</code></pre></figure>`;

/** A callout as Callout.astro builds it. */
const callout = (kind: "Note" | "Warning", body: string) =>
  `<div class="callout" data-kind="${kind.toLowerCase()}" role="note"><p class="kind">${icon}${kind}</p><div class="body">${body}</div></div>`;

/** A built docs page, cut down to the parts the Markdown reads. */
const page = (prose: string) => `<!doctype html>
<html><head><title>Ignored | robkit</title></head><body>
<nav id="site-nav"><a href="/docs/x/">Not in the Markdown</a></nav>
<main id="main">
<header class="page-head"><p class="eyebrow">Build an app</p><h1>Your first app</h1><p class="lead">Add an app &amp; open it.</p></header>
<nav class="toc"><a href="#add">Add it</a></nav>
<div class="prose">${prose}</div>
<footer class="page-foot"><a href="/edit">Edit this page</a></footer>
</main></div>
<footer class="footer"><p>Not in the Markdown either.</p></footer>
</body></html>`;

describe("markdownOf", () => {
  it("writes the page's title, its lead and its prose, with a link to a heading on the page at the page's address", () => {
    const html = page(
      '<p>An app is a folder in <code>apps/</code>. See <a href="/docs/concepts/apps/">apps</a>, and <a href="#add">Add it</a>.</p>\n<h2 id="add">Add it</h2>\n<ul><li><strong>One.</strong> First.</li><li>Two.</li></ul>',
    );

    expect(markdownOf(html, href)).toBe(`# Your first app

Add an app & open it.

An app is a folder in \`apps/\`. See [apps](/docs/concepts/apps/), and [Add it](/docs/get-started/your-first-app/#add).

## Add it

- **One.** First.
- Two.
`);
  });

  it("writes each stack's sample under its name, and no tabs", () => {
    const html = page(
      `<div class="switch" data-stack-switch><div class="tabs" role="tablist" aria-label="Stack"><button type="button" role="tab" class="tab">React + Hono</button><button type="button" role="tab" class="tab">React + Go</button></div><div class="panel" data-stack-panel="react-hono"><p class="name">React + Hono</p>${frame("sh", "Terminal", ["pnpm dev"], true)}</div><div class="panel" data-stack-panel="go"><p class="name">React + Go</p>${frame("sh", "Terminal", ["go run ."], true)}</div></div>`,
    );

    expect(markdownOf(html, href)).toContain(`**React + Hono**

\`\`\`sh
pnpm dev
\`\`\`

**React + Go**

\`\`\`sh
go run .
\`\`\`
`);
    expect(markdownOf(html, href)).not.toContain("Copy");
  });

  it("writes a file's code in a fence that names the file", () => {
    const html = page(
      frame("ts", "apps/notes/src/schema.ts", [
        "import { table } from &quot;x&quot;;",
        "",
        "export const notes = table(&quot;notes&quot;);",
      ]) + frame("ts", "TypeScript", ["const a = 1 &lt; 2;"]),
    );

    expect(markdownOf(html, href))
      .toContain(`\`\`\`ts title="apps/notes/src/schema.ts"
import { table } from "x";

export const notes = table("notes");
\`\`\`

\`\`\`ts
const a = 1 < 2;
\`\`\`
`);
  });

  it("writes a callout and the pre-release line as quoted text with their kind", () => {
    const html = page(
      `<div data-pre-release>${callout("Note", '<p>robkit isn\'t on npm yet. <a href="/docs/get-started/quickstart/#make-an-install">The quickstart</a> shows how.</p>')}</div>${callout("Warning", "<p>This deletes the data.</p>")}`,
    );

    expect(markdownOf(html, href)).toContain(`> **Note**
>
> robkit isn't on npm yet. [The quickstart](/docs/get-started/quickstart/#make-an-install) shows how.

> **Warning**
>
> This deletes the data.
`);
  });

  it("writes a diagram as its title and description, and a screenshot as an image", () => {
    const html = page(
      '<figure class="diagram"><svg viewBox="0 0 10 10" role="img" aria-labelledby="t d"><title id="t">From sign-in to a token</title><desc id="d">Ten steps between the browser and core.</desc><rect></rect><text>Core</text></svg></figure><figure class="shot"><div class="bar" aria-hidden="true"><span class="address">hub.localhost</span></div><img src="/_astro/hub.png" width="800" height="500" alt="The hub, signed in." loading="lazy"></figure>',
    );

    expect(markdownOf(html, href))
      .toContain(`Diagram: From sign-in to a token. Ten steps between the browser and core.

![The hub, signed in.](/_astro/hub.png)
`);
  });

  it("writes the install's tree as a list, each folder with what it holds", () => {
    const html = page(
      '<ul class="tree"><li><code>apps/</code><span class="about">The apps.</span><ul class="tree"><li><code>hub/</code><span class="about">Where people sign in.</span></li></ul></li></ul>',
    );

    expect(markdownOf(html, href)).toContain(`- \`apps/\` The apps.
  - \`hub/\` Where people sign in.
`);
  });

  it("leaves out HTML comments, in the text and in code", () => {
    const html = page(
      `<p>Kept.<!-- not this --></p>${frame("sh", "Terminal", ["pnpm dev<!-- nor this -->"], true)}`,
    );

    expect(markdownOf(html, href)).toBe(`# Your first app

Add an app & open it.

Kept.

\`\`\`sh
pnpm dev
\`\`\`
`);
  });

  it("is undefined for a page with no docs prose", () => {
    expect(markdownOf("<html><body><h1>Home</h1></body></html>", "/")).toBe(
      undefined,
    );
  });
});
