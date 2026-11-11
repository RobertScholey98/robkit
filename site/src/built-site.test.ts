// Reads the site as Astro built it. Turbo runs the site's build before its
// tests, so dist is fresh.

import { spawnSync } from "node:child_process";
import { glob, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestGuard } from "@robkit/session";
import { defaultChoices, init, readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { appFiles } from "./app-files.ts";
import type { TreeEntry } from "./install-tree.ts";
import { installGoVersion, installNodeVersion } from "./install.ts";
import { quickstartCommands } from "./readme.ts";
import { repoRoot } from "./repo.ts";
import { built, codeBlocks, itemsAfter, origin } from "./test/built.ts";
import { anchorOf, glossaryTerms } from "./repo-markdown.ts";
import { docsHome, preRelease, repoUrl } from "./site.ts";
import { guideHref } from "./stacks.ts";

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
    "pnpm install",
    "pnpm create-install ../my-install",
  ].join("\n");

  // The clone's route needs no Corepack, which Node 26 doesn't ship. It
  // starts the install from the clone's folder, where the reader still is,
  // so the folder is one up.
  it("leads with the route from a clone until the first release, and drops it after", async () => {
    const terminals = codeBlocks(await built(page))
      .filter(({ label }) => label === "Terminal")
      .map(({ code }) => code);

    // A function of the switch, so the test reads the same either way.
    const expected = (released: boolean) => [
      ...(released ? [] : [clone]),
      "npm create robkit my-install",
      released ? "cd my-install\npnpm dev" : "cd ../my-install\npnpm dev",
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

describe("the built Next.js guide", () => {
  it("gives each name and line of code the template's AGENTS.md gives on images", async () => {
    const agents = await readFile(
      join(repoRoot, "packages/create-robkit/templates/stacks/next/AGENTS.md"),
      "utf8",
    );
    const images = /^## Images\n([\s\S]*?)^## /m.exec(agents)?.[1] ?? "";
    const html = await built("docs/build-an-app/nextjs/index.html");
    const section = html.slice(
      html.indexOf('<h2 id="images"'),
      html.indexOf('<h2 id="the-test"'),
    );
    const onPage = [...section.matchAll(/<code>([^<]+)<\/code>/g)].map(
      ([, code = ""]) =>
        code
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&quot;", '"')
          .replaceAll("&#123;", "{")
          .replaceAll("&#125;", "}"),
    );
    const inAgents = [...images.matchAll(/`([^`]+)`/g)].map(([, code]) => code);

    expect(inAgents).toContain('<Image src="/logo.png" unoptimized ... />');
    expect(onPage).toEqual(expect.arrayContaining(inAgents));
  });
});

describe("the built page on the layer rule", () => {
  /** Each file the page's sample breaks the rule in, and what it says. */
  const breaks = {
    "apps/example/src/reach.ts": 'import "../../hub/src/app.tsx";\n',
    "apps/example/src/core.ts": 'import { createCore } from "@robkit/core";\n',
    "apps/example/src/token.ts": 'import { jwtVerify } from "jose";\n',
    "apps/example/src/built.ts": 'import "../dist/serve.js";\n',
    "packages/ui/src/reach.ts": 'import "../../../apps/example/visits.ts";\n',
  };
  /** A .d.ts file's import of another under dist, as next-env.d.ts has. */
  const types = {
    "apps/example/next-env.d.ts": 'import "./dist/dev/types/routes.d.ts";\n',
  };

  it("shows what robkit check prints for an install that breaks each rule", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "site-check-")), "install");
    await init(defaultChoices, dir, { install: false });
    for (const [path, text] of Object.entries({ ...breaks, ...types })) {
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
    expect(checked.stdout.trimEnd().split("\n")).toHaveLength(5);
    expect(checked.stdout).not.toContain("next-env.d.ts");
  }, 60_000);

  it("says what the install's AGENTS.md says of a .d.ts file", async () => {
    const agents = await readFile(
      join(repoRoot, "packages/create-robkit/templates/base/AGENTS.md"),
      "utf8",
    );
    const sentence = /A `\.d\.ts` file may import [^\n]*?not code\./.exec(
      agents,
    )?.[0];
    const page = (await built("docs/build-an-app/the-layer-rule/index.html"))
      .replaceAll(/<[^>]+>/g, "")
      .replaceAll("’", "'");

    expect(sentence).toBeDefined();
    expect(page).toContain(String(sentence).replaceAll("`", ""));
  });
});

describe("the built page on pnpm dev and your apps", () => {
  const page = "docs/run-an-install/pnpm-dev-and-your-apps/index.html";

  /** What `robkit add` prints for an option it doesn't take. */
  const addUsage = async () => {
    const dir = await mkdtemp(join(tmpdir(), "site-add-"));
    await writeFile(join(dir, "robkit.json"), '{"exampleStack":"start"}\n');
    const bin = join(repoRoot, "packages/create-robkit/src/robkit-command.ts");
    return spawnSync(process.execPath, [bin, "add", "notes", "--nope"], {
      cwd: dir,
      encoding: "utf8",
    }).stderr;
  };

  it("names each option robkit add takes, with its default", async () => {
    const usage = await addUsage();
    const items = itemsAfter(await built(page), "add-an-app");
    const defaults =
      /stack defaults to (\S+), access to (\S+) only, and the icon\s+to (\S+)\./.exec(
        usage,
      );

    const line = /^Usage: robkit add .*$/m.exec(usage)?.[0] ?? "";

    expect(items.map((item) => /^--[a-z]+/.exec(item)?.[0])).toEqual(
      line.match(/(?<=\[)--[a-z]+/g),
    );
    expect(items.map((item) => /By default, (.+)\.$/.exec(item)?.[1])).toEqual([
      defaults?.[1],
      defaults?.[2],
      "none",
      defaults?.[3]?.replace(/\.$/, ""),
    ]);
    expect(/one of (.+?)\.\s/.exec(items[0] ?? "")?.[1]).toBe(
      `${readyStacks.slice(0, -1).join(", ")} or ${String(readyStacks.at(-1))}`,
    );
  });

  it("is written, not a stub", async () => {
    expect(await built(page)).not.toContain("data-stub");
  });
});

describe("the built page on guests and access", () => {
  /** The page's words, without its markup. */
  const words = async () =>
    (await built("docs/run-an-install/guests-and-access/index.html"))
      .replaceAll(/<[^>]+>/g, "")
      .replaceAll(/\s+/g, " ");
  const source = (path: string) => readFile(join(repoRoot, path), "utf8");
  /** The first number `pattern` captures in `text`, or NaN. */
  const numberIn = (text: string, pattern: RegExp) =>
    Number(pattern.exec(text)?.[1]);

  it("gives the sign-in limits and session length the code sets", async () => {
    const limits = await source("packages/core/src/sign-in-limits.ts");
    const session = await source("packages/core/src/session-claims.ts");
    const page = await words();
    const codes = numberIn(limits, /codesPerClient: (\d+)/);
    const passwords = numberIn(limits, /passwordsPerClient: (\d+)/);
    const window = numberIn(limits, /clientWindowMs: (\d+) \* minute/);
    const install = numberIn(limits, /codesPerInstall: (\d+)/);
    const days = numberIn(session, /sessionLifetimeSeconds = (\d+) \* 24/);

    expect(numberIn(limits, /installWindowMs: (\d+) \* minute/)).toBe(60);
    expect(page).toContain(
      `Each visitor gets ${String(codes)} tries every ${String(window)} minutes.`,
    );
    expect(page).toContain(
      `The whole install takes ${String(install)} wrong codes an hour`,
    );
    expect(page).toContain(
      `${String(passwords)} tries per visitor every ${String(window)} minutes`,
    );
    expect(page).toContain(`stays signed in for ${String(days)} days`);
  });

  it("gives the odds SECURITY.md gives", async () => {
    const security = await source("SECURITY.md");
    const page = await words();
    const generated =
      /A generated code is (\d+) characters from (\d+), about ([\d.]+ million) codes/.exec(
        security,
      );
    const odds =
      /about (\d+) years with 1 live code, and about (\d+) years with (\d+), about a (\d+)% chance/.exec(
        security,
      );

    expect(numberIn(security, /limited to (\d+) an hour/)).toBe(20);
    expect(page).toContain(
      `picks ${String(generated?.[1])} characters from ${String(generated?.[2])} letters and digits`,
    );
    expect(page).toContain(`one of about ${String(generated?.[3])}`);
    expect(page).toContain(`a hit after about ${String(odds?.[1])} years`);
    expect(page).toContain(
      `With ${String(odds?.[3])} live codes, it is about ${String(odds?.[2])} years, a ${String(odds?.[4])}% chance`,
    );
    expect(security).toContain("A 3-character code stays guessable in weeks.");
    expect(page).toContain("A 3-character code can be guessed in weeks");
  });

  it("is written, not a stub", async () => {
    expect(
      await built("docs/run-an-install/guests-and-access/index.html"),
    ).not.toContain("data-stub");
  });
});

describe("the built glossary", () => {
  const page = "docs/concepts/glossary/index.html";

  it("has a heading with an anchor for every term in GLOSSARY.md", async () => {
    const glossary = await readFile(join(repoRoot, "GLOSSARY.md"), "utf8");
    const html = await built(page);
    const headings = [...html.matchAll(/<h3 id="([^"]+)">([^<]+)<\/h3>/g)];

    expect(headings.map(([, , term]) => term?.replaceAll("’", "'"))).toEqual(
      glossaryTerms(glossary),
    );
    expect(headings.map(([, id]) => id)).toEqual(
      glossaryTerms(glossary).map(anchorOf),
    );
  });

  it("links each term it names in a meaning to that term's heading", async () => {
    const html = await built(page);
    const ids = new Set(
      [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id),
    );
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);

    expect(targets).toContain("cores-origin");
    expect(targets.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("names GLOSSARY.md as the file to edit", async () => {
    expect(await built(page)).toContain(`${repoUrl}/edit/main/GLOSSARY.md`);
  });
});

describe("the built page on how it works", () => {
  const page = "docs/concepts/how-it-works/index.html";

  it("draws the sign-in as an image with a text alternative, and lists each step it numbers", async () => {
    const html = await built(page);
    const svg = /<svg[^>]*role="img"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
    const [labelledBy = ""] =
      /aria-labelledby="([^"]+)"/.exec(svg)?.slice(1) ?? [];
    const alternative = labelledBy
      .split(" ")
      .map((id) =>
        new RegExp(`id="${id}"[^>]*>([^<]+)<`).exec(svg)?.[1]?.trim(),
      );
    const arrows = svg.match(/marker-end=/g) ?? [];
    const steps =
      /<ol>([\s\S]*?)<\/ol>/
        .exec(html.slice(html.indexOf(svg)))?.[1]
        ?.match(/<li>/g) ?? [];

    expect(alternative).toHaveLength(2);
    expect(alternative[0]).toBe("From sign-in to an app token");
    expect(alternative[1]).toMatch(/^Ten numbered steps between the browser/);
    expect(arrows).toHaveLength(10);
    expect(steps).toHaveLength(arrows.length);
  });
});

describe("the built page on security", () => {
  const page = "docs/concepts/security/index.html";
  const security = () => readFile(join(repoRoot, "SECURITY.md"), "utf8");
  /** The items of the list in `markdown`'s block that starts with `start`. */
  const itemsIn = (markdown: string, start: string) =>
    markdown
      .replaceAll("\r\n", "\n")
      .split(/\n{2,}/)
      .find((block) => block.startsWith(start))
      ?.split("\n")
      .filter(Boolean) ?? [];

  it("lists each of SECURITY.md's known gaps, linking to GitHub", async () => {
    const gaps = itemsIn(
      (await security()).split("### Known gaps")[1] ?? "",
      "- ",
    );
    const html = await built(page);
    const items = itemsAfter(html, "known-gaps");

    expect(gaps.length).toBeGreaterThan(5);
    expect(items).toHaveLength(gaps.length);
    expect(items[0]).toBe(
      gaps[0]?.slice(2).replaceAll("'", "’").replaceAll("`", ""),
    );
    expect(html).toContain(
      `href="${repoUrl}/blob/main/.scratch/just-use-it/issues/29-access-codes-at-least-five.md"`,
    );
  });

  it("lists each way past the lint SECURITY.md gives", async () => {
    const ways = (await security())
      .split("The known ways past the lint:\n\n")[1]
      ?.split("\n\n")[0]
      ?.split("\n");

    const html = await built(page);
    const list = /<ul>[\s\S]*?<\/ul>/.exec(
      html.slice(html.indexOf("in these ways and maybe others")),
    )?.[0];

    expect(ways).toContain("- `createRequire`.");
    expect(list?.match(/<li>/g)).toHaveLength(ways?.length ?? -1);
    expect(list).toContain("<code>createRequire</code>");
  });

  it("gives the way to report a vulnerability that SECURITY.md gives", async () => {
    const reporting = /private vulnerability reporting\]\((\S+)\)/.exec(
      await security(),
    )?.[1];

    expect(reporting).toMatch(/^https:\/\/github\.com\/.+\/security\//);
    expect(await built(page)).toContain(`href="${String(reporting)}"`);
  });
});

describe("the built page on upgrading", () => {
  const page = "docs/run-an-install/upgrading/index.html";
  const source = (path: string) => readFile(join(repoRoot, path), "utf8");
  const codes = async () =>
    codeBlocks(await built(page)).map(({ code }) => code.trim());

  it("shows the install README's upgrade commands, and its list of what an upgrade never reaches", async () => {
    const readme = await source(
      "packages/create-robkit/templates/base/README.md",
    );
    const section =
      readme.replaceAll("\r\n", "\n").split(/^## Upgrade robkit$/m)[1] ?? "";
    const fences = [
      ...(section.split(/^## /m)[0] ?? "").matchAll(
        /^```sh\n([\s\S]*?)^```$/gm,
      ),
    ].map(([, code = ""]) => code.trim());
    const sentence = /^An upgrade doesn't reach [^\n]*?\.github`\./m.exec(
      section,
    )?.[0];

    expect(fences).toHaveLength(2);
    expect(await codes()).toEqual(expect.arrayContaining(fences));
    expect(sentence).toBeDefined();
    expect(
      (await built(page)).replaceAll(/<[^>]+>/g, "").replaceAll("’", "'"),
    ).toContain(String(sentence).replaceAll("`", ""));
  });

  it("names every path upgrade writes, and no other", async () => {
    const handover = await source(
      "packages/create-robkit/src/upgrade-handover.ts",
    );
    const listed = (name: string) =>
      [
        ...(
          new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(handover)?.[1] ??
          ""
        ).matchAll(/"([^"]+)"/g),
      ].map(([, path]) => path);
    const written = [...listed("ownedPaths"), ...listed("ownedFolders")];

    expect(written).toHaveLength(5);
    expect(
      itemsAfter(await built(page), "what-it-changes").map(
        (item) => /^(\S+?)[.,]\s/.exec(item)?.[1],
      ),
    ).toEqual(written);
  });

  it("quotes the lines robkit upgrade prints", async () => {
    const upgrade = await source("packages/create-robkit/src/upgrade.ts");
    const quoted = (await codes()).filter((code) => !code.includes("\n"));

    expect(quoted).toContainEqual(
      expect.stringMatching(/^Next, read git diff/),
    );
    for (const line of quoted) expect(upgrade).toContain(line);
  });

  it("is written, not a stub", async () => {
    expect(await built(page)).not.toContain("data-stub");
  });
});

/** Each entry's name, in the order a tree shows them. */
const treeNames = (entries: readonly TreeEntry[]): string[] =>
  entries.flatMap(({ name, children = [] }) => [name, ...treeNames(children)]);

/** The files a Node server's guide shows whole, and the part it shows. */
const serverGuide = {
  whole: [
    "src/schema.ts",
    "src/visits.ts",
    "src/server.tsx",
    "src/routes.test.tsx",
  ],
  parts: [{ path: "src/routes.tsx", from: "export function routes" }],
};

describe.each([
  {
    name: "React + Hono",
    stack: "react-hono",
    guide: "react-hono",
    ...serverGuide,
  },
  {
    name: "React + Express",
    stack: "express",
    guide: "react-express",
    ...serverGuide,
  },
  {
    name: "TanStack Start",
    stack: "start",
    guide: "tanstack-start",
    whole: [
      "src/schema.ts",
      "src/visits.ts",
      "src/routes/index.tsx",
      "src/server.ts",
      "src/start.ts",
      "src/home.test.tsx",
    ],
    parts: [],
  },
  {
    name: "Next.js",
    stack: "next",
    guide: "nextjs",
    whole: [
      "src/schema.ts",
      "src/visits.ts",
      "src/app/page.tsx",
      "src/app/actions.ts",
      "src/proxy.ts",
      "next.config.ts",
      "src/home.tsx",
      "src/home.test.tsx",
    ],
    parts: [],
  },
  {
    name: "React + Go",
    stack: "go",
    guide: "react-go",
    whole: [
      "go.mod",
      "migrations/0001_init.sql",
      "visits.go",
      "server_test.go",
    ],
    parts: [
      { path: "server.go", from: "func routes(" },
      { path: "src/home.tsx", from: "async function me(" },
      { path: "server.go", from: "func serve(" },
    ],
  },
] as const)(
  "the built guide for $name",
  ({ name, stack, guide, whole, parts }) => {
    const page = `docs/build-an-app/${guide}/index.html`;
    const file = async (path: string) =>
      (
        await readFile(
          join(
            repoRoot,
            "packages/create-robkit/templates/stacks",
            stack,
            path,
          ),
          "utf8",
        )
      )
        .replaceAll("\r\n", "\n")
        .trimEnd();

    it("shows the files it walks through as the template holds them", async () => {
      const blocks = codeBlocks(await built(page));

      for (const path of whole) {
        expect(blocks).toContainEqual({
          label: `apps/notes/${path}`,
          code: await file(path),
        });
      }
      for (const { path, from } of parts) {
        // A part may end on the file's last line, which file() trims.
        const text = `${await file(path)}\n`;
        const start = text.indexOf(from);
        expect(blocks).toContainEqual({
          label: `apps/notes/${path}`,
          code: text.slice(start, text.indexOf("\n}\n", start) + 2),
        });
      }
    });

    it("lists every file the app gets, and is written, not a stub", async () => {
      const html = await built(page);
      const start = html.indexOf(`aria-label="An app on ${name}"`);
      const tree = html.slice(start, html.indexOf("<h2", start));
      const names = [
        ...tree.matchAll(/<li[^>]*>\s*<code[^>]*>([^<]+)<\/code>/g),
      ].map(([, each = ""]) => each);

      expect(start).toBeGreaterThan(-1);
      expect(names).toEqual(treeNames(appFiles[stack]));
      expect(html).not.toContain("data-stub");
    });
  },
);

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

describe("the built docs folders", () => {
  const leadsTo = (html: string) =>
    /<meta http-equiv="refresh" content="0; url=([^"]+)">/.exec(html)?.[1];

  it("lead /docs/ and each folder to its first page in the sidebar's order", async () => {
    const docs = await built(`${docsHome.slice(1)}index.html`);
    const order = [
      ...(/<nav id="site-nav"[\s\S]*?<\/nav>/.exec(docs)?.[0] ?? "").matchAll(
        /href="([^"]+)"/g,
      ),
    ].map(([, href = ""]) => href);
    const folders = new Set(["/docs/"]);
    for (const href of order) {
      folders.add(href.replace(/[^/]+\/$/, ""));
    }
    expect(folders.size).toBeGreaterThan(5);

    for (const folder of folders) {
      const html = await built(`${folder.slice(1)}index.html`);

      expect(leadsTo(html), folder).toBe(
        order.find((href) => href.startsWith(folder)),
      );
      expect(html, folder).toContain('<meta name="robots" content="noindex">');
    }
    expect(leadsTo(await built("docs/index.html"))).toBe(docsHome);
  });

  it("stay out of search, llms.txt and the Markdown copies", async () => {
    const search = await built("search.json");
    const llms = await built("llms.txt");

    for (const folder of ["/docs/", "/docs/get-started/"]) {
      expect(search).not.toContain(`"href":"${folder}"`);
      expect(llms).not.toContain(`(${origin}${folder.replace(/\/$/, ".md")})`);
      await expect(
        built(folder.replace(/^\/|\/$/g, "") + ".md"),
      ).rejects.toThrow();
    }
  });
});

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
  /** The pre-release line's words on a built page, its link as written. */
  const line = async (page: string) =>
    /<div data-pre-release>[\s\S]*?<p>([\s\S]*?)<\/p>\s*<\/div>/.exec(
      await built(page),
    )?.[1];

  it.skipIf(!preRelease)(
    "sends a reader to the quickstart, but on the quickstart to the steps below",
    async () => {
      expect(await line("docs/reference/npm-create-robkit/index.html")).toMatch(
        /which needs git\. <a href="\/docs\/get-started\/quickstart\/#make-an-install">The quickstart<\/a> shows how\.$/,
      );
      expect(await line("docs/get-started/quickstart/index.html")).toMatch(
        /which needs git\. The steps below show how\.$/,
      );
    },
  );

  it("is on each page that shows npm create robkit while preRelease is on, and on none when it's off", async () => {
    const pages: { page: string; shows: boolean; line: boolean }[] = [];
    for await (const page of glob("**/*.html", {
      cwd: join(repoRoot, "site", "dist"),
    })) {
      const html = await built(page);
      // A docs folder's page names the page it sends the reader to, which
      // may be npm create robkit's, and shows no command.
      if (html.includes('<meta http-equiv="refresh"')) continue;
      const line = html.includes("data-pre-release");
      // Shiki gives each word of a command its own tag, so read the text.
      // The line says `npm create robkit` once itself, and a link in the
      // sidebar or the pager that names its reference page shows nothing.
      const text = html
        .replaceAll(/<nav[\s\S]*?<\/nav>/g, "")
        .replaceAll(/<[^>]+>/g, "");
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
