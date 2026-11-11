import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeMarkdownCopies } from "./markdown-copies.ts";
import { readPages } from "./pages.ts";
import { switcherStacks } from "./stacks.ts";
import { built } from "./test/built.ts";

/** A built page: a docs page when it has `prose`, else any other page. */
const page = (title: string, prose?: string) =>
  `<html><body><main>${
    prose === undefined
      ? `<h1>${title}</h1>`
      : `<header class="page-head"><h1>${title}</h1><p class="lead">About ${title}.</p></header><div class="prose">${prose}</div><footer class="page-foot"></footer>`
  }</main></body></html>`;

async function site(files: Record<string, string>): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), "markdown-copies-"));
  for (const [path, html] of Object.entries(files)) {
    await mkdir(join(dist, path, ".."), { recursive: true });
    await writeFile(join(dist, path), html);
  }
  return dist;
}

describe("writeMarkdownCopies", () => {
  it("writes each docs page as Markdown beside its folder", async () => {
    const dist = await site({
      "index.html": page("robkit"),
      "docs/get-started/quickstart/index.html": page(
        "Quickstart",
        '<p>Run it. <a href="#claim">Claim it</a>.</p>',
      ),
      "docs/reference/settings/index.html": page(
        "Every setting",
        '<p class="stub" data-stub>Not yet.</p>',
      ),
      // A page under docs/ that isn't a docs page gets no Markdown copy.
      "docs/index.html": page("Docs"),
    });

    await writeMarkdownCopies(dist);

    expect(
      await readFile(join(dist, "docs/get-started/quickstart.md"), "utf8"),
    ).toBe(
      "# Quickstart\n\nAbout Quickstart.\n\nRun it. [Claim it](/docs/get-started/quickstart/#claim).\n",
    );
    expect(
      await readFile(join(dist, "docs/reference/settings.md"), "utf8"),
    ).toBe("# Every setting\n\nAbout Every setting.\n\nNot yet.\n");
    await expect(readFile(join(dist, "docs.md"), "utf8")).rejects.toThrow(
      "ENOENT",
    );
  });
});

/** A Markdown copy without its code, inline or fenced. */
const prose = (markdown: string) =>
  markdown.replaceAll(/^(`{3,})[\s\S]*?^\1/gm, "").replaceAll(/`[^`\n]*`/g, "");

const escaped = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("the built site's Markdown copies", async () => {
  const docs = await readPages();

  it("are at each docs page's address with .md for its trailing slash", async () => {
    for (const { id, title } of docs) {
      expect(await built(`docs/${id}.md`), id).toMatch(
        new RegExp(`^# ${escaped(title)}\n`),
      );
    }
  });

  it("hold no import, JSX or expression from the page's source", async () => {
    for (const { id } of docs) {
      const text = prose(await built(`docs/${id}.md`));

      expect(text, id).not.toMatch(/^(?:import|export) /m);
      expect(text, id).not.toMatch(/<[A-Z][A-Za-z]*[\s/>]/);
      expect(text, id).not.toMatch(/[{}]/);
    }
  });

  it("write every stack's sample under its name, and a template file in a fence that names it", async () => {
    const markdown = await built("docs/get-started/your-first-app.md");

    for (const { label } of switcherStacks) {
      expect(markdown).toMatch(
        new RegExp(
          `\\*\\*${escaped(label)}\\*\\*\n\n\`\`\`\\w+ title="apps/notes/`,
        ),
      );
    }
  });

  it("write a callout and the pre-release line as text", async () => {
    expect(await built("docs/run-an-install/upgrading.md")).toMatch(
      /^> \*\*(Note|Warning)\*\*\n>\n> \S/m,
    );
    expect(await built("docs/get-started/quickstart.md")).toContain(
      "> robkit isn't on npm yet, so `npm create robkit` won't work until its first release.",
    );
  });

  it("link each docs page to its copy", async () => {
    for (const { id } of docs) {
      expect(await built(`docs/${id}/index.html`), id).toContain(
        `<link rel="alternate" type="text/markdown" href="/docs/${id}.md">`,
      );
    }
  });
});
