// Reads the site as Astro built it. Turbo runs the site's build before its
// tests, so dist is fresh.

import { spawnSync } from "node:child_process";
import { glob, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestGuard } from "@robkit/session";
import { defaultChoices, init, readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { installGoVersion, installNodeVersion } from "./install.ts";
import { quickstartCommands } from "./readme.ts";
import { repoRoot } from "./repo.ts";
import { docsHome, preRelease, repoUrl } from "./site.ts";
import { guideHref } from "./stacks.ts";

const built = (path: string) =>
  readFile(join(repoRoot, "site", "dist", path), "utf8");

describe("the built home page", () => {
  it("shows the three commands from the README's quickstart, in a terminal", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const commands = quickstartCommands(readme, "README.md");
    const blocks = codeBlocks(await built("index.html"));

    expect(commands).toHaveLength(3);
    expect(blocks).toContainEqual({
      label: "Terminal",
      code: commands.join("\n"),
    });
  });

  it("links to each stack robkit can make, by name, at its guide", async () => {
    const html = await built("index.html");
    const list = /<ul[^>]*data-home-stacks[^>]*>([\s\S]*?)<\/ul>/.exec(html);
    const links = [
      ...(list?.[1] ?? "").matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
    ].map(([, href, name = ""]) => ({
      href,
      name: name.replaceAll(/<[^>]+>/g, "").trim(),
    }));

    expect(links.map(({ name }) => name)).toEqual([
      "TanStack Start",
      "React + Hono",
      "React + Express",
      "Next.js",
      "React + Go",
    ]);
    expect(links.map(({ href }) => href)).toEqual(
      readyStacks.map((stack) => guideHref(stack)),
    );
  });

  it("shows the example app's page from the React + Hono template", async () => {
    const lines = (
      await readFile(
        join(
          repoRoot,
          "packages/create-robkit/templates/stacks/react-hono/src/routes.tsx",
        ),
        "utf8",
      )
    )
      .replaceAll("\r\n", "\n")
      .split("\n");
    const first = lines.findIndex((line) =>
      line.includes('.get("/", async (c) => {'),
    );
    const last = lines.indexOf("      })", first);
    const handler = lines
      .slice(first, last + 1)
      .map((line) => line.slice("      ".length))
      .join("\n");

    expect(first).toBeGreaterThan(-1);
    expect(codeBlocks(await built("index.html"))).toContainEqual({
      label: "apps/example/src/routes.tsx",
      code: handler,
    });
  });

  it("says who it suits, what it needs and where to report a problem", async () => {
    const html = await built("index.html");
    const headings = [...html.matchAll(/<h[23][^>]*>([^<]*)<\/h[23]>/g)].map(
      ([, text]) => text,
    );

    expect(headings).toEqual(
      expect.arrayContaining(["Who it suits", "To try it", "To host it"]),
    );
    expect(html).toContain(`href="${repoUrl}/issues"`);
  });
});

describe("the built quickstart", () => {
  const page = "docs/get-started/quickstart/index.html";
  const clone = [
    "git clone https://github.com/RobertScholey98/robkit.git",
    "cd robkit",
    "corepack enable",
    "pnpm install",
    "pnpm create-install ../my-install",
  ].join("\n");

  it("leads with the route from a clone until the first release, and drops it after", async () => {
    const terminals = codeBlocks(await built(page))
      .filter(({ label }) => label === "Terminal")
      .map(({ code }) => code);

    // A function of the switch, so the test reads the same either way.
    const expected = (released: boolean) => [
      ...(released ? [] : [clone]),
      "npm create robkit my-install",
      "cd my-install\npnpm dev",
    ];

    expect(terminals).toEqual(expected(!preRelease));
  });

  it("is written, not a stub", async () => {
    expect(await built(page)).not.toContain("data-stub");
    expect(
      await built("docs/get-started/your-first-app/index.html"),
    ).not.toContain("data-stub");
  });
});

describe("the built Your first app page", () => {
  const page = "docs/get-started/your-first-app/index.html";

  it("shows each stack's owner heading in the app the reader added", async () => {
    const labels = codeBlocks(await built(page)).map(({ label }) => label);

    expect(labels).toEqual([
      "Terminal",
      "apps/notes/src/home.tsx",
      "apps/notes/src/routes.tsx",
      "apps/notes/src/routes.tsx",
      "apps/notes/src/home.tsx",
      "apps/notes/src/home.tsx",
    ]);
  });

  it("links to the guide for each stack robkit can make", async () => {
    const html = await built(page);
    const list = /<ul data-stack-guides[^>]*>([\s\S]*?)<\/ul>/.exec(html);
    const hrefs = [...(list?.[1] ?? "").matchAll(/href="([^"]+)"/g)].map(
      ([, href]) => href,
    );

    expect(hrefs).toEqual(readyStacks.map((stack) => guideHref(stack)));
  });
});

describe("the built What you need page", () => {
  it("gives the Node and Go versions the templates ask for", async () => {
    const html = await built("docs/get-started/what-you-need/index.html");

    expect(html).toContain(`needs Node ${await installNodeVersion()} or later`);
    expect(html).toContain(`Go ${await installGoVersion()} or later`);
  });
});

describe("the built page on the viewer and the guard", () => {
  const page = "docs/build-an-app/the-viewer-and-the-guard/index.html";

  /** The `<code>` in the paragraph that says `text`. */
  const codeIn = (html: string, text: string) => {
    const paragraph = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map(([, inner = ""]) => inner)
      .find((inner) => inner.includes(text));
    return [...(paragraph ?? "").matchAll(/<code>([^<]+)<\/code>/g)].map(
      ([, name = ""]) => name,
    );
  };

  /** What the guard does with `method` from another app's origin. */
  const fromAnotherOrigin = async (method: string) => {
    const decided = await requestGuard({
      app: "notes",
      core: "http://core.robkit.localhost:3000",
      access: { kind: "open" },
    })(
      new Request("http://notes.robkit.localhost:3000/", {
        method,
        headers: { origin: "http://photos.robkit.localhost:3000" },
      }),
    );
    return decided.outcome === "answer" ? decided.response.status : 200;
  };

  it("names the methods the guard lets through and the ones it treats as writes", async () => {
    const html = await built(page);
    const passing = codeIn(html, "pass from anywhere");
    const writes = codeIn(html, "is a write");
    // A method of an app's own, which the page names in words.
    const made = "PROPFIND";

    expect(passing).toEqual(["GET", "HEAD", "OPTIONS"]);
    expect(writes).toEqual(["POST", "PUT", "PATCH", "DELETE"]);
    for (const method of passing) {
      expect(await fromAnotherOrigin(method), method).not.toBe(403);
    }
    for (const method of [...writes, made]) {
      expect(await fromAnotherOrigin(method), method).toBe(403);
    }
  });
});

describe("the built page on the layer rule", () => {
  /** Each file the page's sample breaks the rule in, and what it says. */
  const breaks = {
    "apps/example/src/reach.ts": 'import "../../hub/src/app.tsx";\n',
    "apps/example/src/core.ts": 'import { createCore } from "@robkit/core";\n',
    "apps/example/src/token.ts": 'import { jwtVerify } from "jose";\n',
    "packages/ui/src/reach.ts": 'import "../../../apps/example/visits.ts";\n',
  };

  it("shows what robkit check prints for an install that breaks each rule", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "site-check-")), "install");
    await init(defaultChoices, dir, { install: false });
    for (const [path, text] of Object.entries(breaks)) {
      await writeFile(join(dir, path), text);
    }
    const bin = join(repoRoot, "packages/create-robkit/src/robkit-command.ts");
    const checked = spawnSync(process.execPath, [bin, "check"], {
      cwd: dir,
      encoding: "utf8",
    });
    const blocks = codeBlocks(
      await built("docs/build-an-app/the-layer-rule/index.html"),
    );

    expect(checked.status).toBe(1);
    expect(blocks).toContainEqual({
      label: "Terminal",
      code: "pnpm robkit check",
    });
    expect(blocks).toContainEqual({
      label: "What it prints",
      code: checked.stdout.trimEnd(),
    });
    expect(checked.stdout.trimEnd().split("\n")).toHaveLength(4);
  }, 60_000);
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
      .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
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

describe("the built pages' images", () => {
  it("each say what they show, and hold their space before they load", async () => {
    const problems: string[] = [];
    let count = 0;
    for await (const page of glob("**/*.html", {
      cwd: join(repoRoot, "site", "dist"),
    })) {
      for (const [tag] of (await built(page)).matchAll(/<img\b[^>]*>/g)) {
        count++;
        const attribute = (name: string) =>
          new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
        if (attribute("alt").length < 20)
          problems.push(`${page}: alt in ${tag}`);
        for (const size of ["width", "height"]) {
          if (!/^\d+$/.test(attribute(size))) {
            problems.push(`${page}: ${size} in ${tag}`);
          }
        }
      }
    }

    expect(count).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  });
});

describe("the pre-release line", () => {
  it("is on each page that shows npm create robkit while preRelease is on, and on none when it's off", async () => {
    const pages: { page: string; shows: boolean; line: boolean }[] = [];
    for await (const page of glob("**/*.html", {
      cwd: join(repoRoot, "site", "dist"),
    })) {
      const html = await built(page);
      const line = html.includes("data-pre-release");
      // Shiki gives each word of a command its own tag, so read the text.
      // The line says `npm create robkit` once itself.
      const text = html.replaceAll(/<[^>]+>/g, "");
      const mentions = text.split("npm create robkit").length - 1;
      pages.push({ page, shows: mentions > (line ? 1 : 0), line });
    }
    const showing = pages.filter(({ shows }) => shows);

    expect(showing.length).toBeGreaterThan(1);
    expect(
      pages.filter(({ shows, line }) => line !== (shows && preRelease)),
    ).toEqual([]);
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
