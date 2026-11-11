// Reads the site as Astro built it. Turbo runs the site's build before its
// tests, so dist is fresh.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installGoVersion, installNodeVersion } from "./install.ts";
import { quickstartCommands } from "./readme.ts";
import { repoRoot } from "./repo.ts";
import { docsHome, repoUrl } from "./site.ts";

const built = (path: string) =>
  readFile(join(repoRoot, "site", "dist", path), "utf8");

describe("the built home page", () => {
  it("shows the three commands from the README's quickstart", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const commands = quickstartCommands(readme, "README.md");
    const html = await built("index.html");

    expect(commands).toHaveLength(3);
    for (const command of commands) expect(html).toContain(command);
  });
});

describe("the built What you need page", () => {
  it("gives the Node and Go versions the templates ask for", async () => {
    const html = await built("docs/get-started/what-you-need/index.html");

    expect(html).toContain(`needs Node ${await installNodeVersion()} or later`);
    expect(html).toContain(`Go ${await installGoVersion()} or later`);
  });
});

describe("the built header", () => {
  it("links Docs to a page the build made, and GitHub to the repository", async () => {
    const html = await built("index.html");

    expect(html).toContain(`href="${docsHome}"`);
    expect(html).toContain(`href="${repoUrl}"`);
    await expect(built(`${docsHome.slice(1)}index.html`)).resolves.toContain(
      "<h1",
    );
  });
});

describe("the built samples page", () => {
  it("is built, asks search engines to skip it, and isn't in the sidebar", async () => {
    const html = await built("samples/index.html");
    const docs = await built(`${docsHome.slice(1)}index.html`);

    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('data-language="go"');
    expect(docs).not.toContain('href="/samples/"');
    expect(await built("index.html")).not.toContain("noindex");
  });
});

/** Each code block on a built page: the label above it, and its text. */
function codeBlocks(html: string) {
  const text = (fragment: string) =>
    fragment
      .replaceAll(/<[^>]+>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&");
  return [...html.matchAll(/<figure class="code"[\s\S]*?<\/figure>/g)].map(
    ([figure]) => ({
      label: text(
        /<span class="label"[^>]*>([\s\S]*?)<\/span><\/span>/.exec(
          figure,
        )?.[1] ?? "",
      ),
      code: text(/<pre[^>]*>([\s\S]*?)<\/pre>/.exec(figure)?.[1] ?? ""),
    }),
  );
}

describe("the built samples page's template files", () => {
  const template = async (path: string) =>
    (
      await readFile(
        join(repoRoot, "packages/create-robkit/templates", path),
        "utf8",
      )
    ).replaceAll("\r\n", "\n");

  it("show a template file as the templates hold it, under its name in an install", async () => {
    const blocks = codeBlocks(await built("samples/index.html"));

    expect(blocks).toContainEqual({
      label: "apps/example/go.mod",
      code: (await template("stacks/go/go.mod")).trimEnd(),
    });
  });

  it("show part of one, from its first line to its last", async () => {
    const blocks = codeBlocks(await built("samples/index.html"));
    const main = await template("stacks/go/main.go");
    const start = main.indexOf("func main() {");

    expect(blocks).toContainEqual({
      label: "apps/example/main.go",
      code: main.slice(start, main.indexOf("\n}\n", start) + 2),
    });
  });
});

describe("the built docs pages", () => {
  it("link to the pages before and after them in the sidebar's order", async () => {
    const page = (href: string) => built(`${href.slice(1)}index.html`);
    const hrefs = (html: string) =>
      [...html.matchAll(/href="([^"]+)"/g)].map(([, href = ""]) => href);
    const sidebar = (html: string) =>
      hrefs(/<nav id="site-nav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "");
    const order = sidebar(await page(docsHome));
    expect(order.length).toBeGreaterThan(1);

    for (const [index, href] of order.entries()) {
      const html = await page(href);
      const rel = (name: string) =>
        new RegExp(`href="([^"]+)" rel="${name}"`).exec(html)?.[1];

      expect(sidebar(html), href).toEqual(order);
      expect([rel("prev"), rel("next")], href).toEqual([
        order[index - 1],
        order[index + 1],
      ]);
    }
  });
});
