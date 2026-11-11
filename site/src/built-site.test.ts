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
