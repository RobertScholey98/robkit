// The reference pages for the packages an app imports from, held to what
// each package exports: a TypeScript package's api-report.md, and what
// `go doc` prints for the Go module. The page for the rest names every
// other published package.

import { spawnSync } from "node:child_process";
import { glob, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { repoUrl } from "./site.ts";
import { built, codeBlocks } from "./test/built.ts";

/** The packages with a page of their own, and the page. */
const packagePages = [
  { dir: "packages/hono", slug: "robkit-hono" },
  { dir: "packages/express", slug: "robkit-express" },
  { dir: "packages/next", slug: "robkit-next" },
  { dir: "packages/start", slug: "robkit-start" },
  { dir: "packages/drizzle", slug: "robkit-drizzle" },
  { dir: "packages/react", slug: "robkit-react" },
  { dir: "packages/vite", slug: "robkit-vite" },
  { dir: "packages/serve", slug: "robkit-serve" },
];

const pageOf = (slug: string) => built(`docs/reference/${slug}/index.html`);

const text = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();

/**
 * What a page's "What it exports" section lists, by each `###` heading
 * under it: the names that start each item, before its first full stop.
 */
function listedOn(html: string): Record<string, string[]> {
  const start = html.indexOf('id="what-it-exports"');
  const end = html.indexOf("<h2", start + 1);
  const section = html.slice(start, end === -1 ? undefined : end);
  return Object.fromEntries(
    section
      .split(/<h3 id="[^"]*">/)
      .slice(1)
      .map((part) => {
        const [heading = "", body = ""] = part.split("</h3>");
        const names = [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].flatMap(
          ([, item = ""]) =>
            [...(item.split("</code>.")[0] ?? "").matchAll(/<code>([^<]+)/g)]
              .map(([, code = ""]) => /^[A-Za-z_$][\w$]*/.exec(code)?.[0])
              .filter((name) => name !== undefined),
        );
        return [text(heading), names.toSorted()];
      }),
  );
}

/** Each entry point's exports, by name, as a package's api-report.md gives them. */
function exportsIn(report: string): Record<string, string[]> {
  return Object.fromEntries(
    report
      .split(/^## /m)
      .slice(1)
      .map((part) => {
        const [entry = "", ...rest] = part.split("\n");
        const code = rest.join("\n");
        const declared = [
          ...code.matchAll(
            /^export (?:declare )?(?:function|interface|type|const|let|class|enum) ([A-Za-z_$][\w$]*)/gm,
          ),
        ].map(([, name = ""]) => name);
        const passedOn = [...code.matchAll(/^export (?:type )?\{([^}]*)\}/gm)]
          .flatMap(([, names = ""]) => names.split(","))
          .map((name) =>
            name
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)
              .at(-1),
          )
          .filter((name): name is string => name !== undefined && name !== "");
        return [entry.trim(), [...declared, ...passedOn].toSorted()];
      }),
  );
}

describe("exportsIn", () => {
  it("reads every kind of export an API report has", () => {
    const report = [
      "# @robkit/x API",
      "",
      "## @robkit/x",
      "",
      "```ts",
      'export { coreOrigin } from "@robkit/session";',
      "export function guarded(",
      "  options?: GuardedOptions,",
      "): Handler;",
      "export interface GuardedOptions {}",
      "export type Viewer = string;",
      "export const sessionFetch: typeof fetch;",
      'export { type Plain as Renamed, other } from "./other";',
      "```",
      "",
      "## @robkit/x/testing",
      "",
      "```ts",
      "export declare function owner(): Viewer;",
      "```",
    ].join("\n");

    expect(exportsIn(report)).toEqual({
      "@robkit/x": [
        "GuardedOptions",
        "Renamed",
        "Viewer",
        "coreOrigin",
        "guarded",
        "other",
        "sessionFetch",
      ],
      "@robkit/x/testing": ["owner"],
    });
  });
});

describe("the reference page for each package an app imports from", () => {
  it.each(packagePages)(
    "$slug lists each export of each entry point, and nothing else",
    async ({ dir, slug }) => {
      const report = await readFile(
        join(repoRoot, dir, "api-report.md"),
        "utf8",
      );

      expect(listedOn(await pageOf(slug))).toEqual(exportsIn(report));
    },
  );

  it.each(packagePages)(
    "$slug links to the package's README and API report",
    async ({ dir, slug }) => {
      const html = await pageOf(slug);

      for (const file of ["README.md", "api-report.md"]) {
        expect(html).toContain(`href="${repoUrl}/blob/main/${dir}/${file}"`);
      }
    },
  );
});

describe("the reference page for the other packages", () => {
  it("has a section for every published package without a page of its own", async () => {
    const published: string[] = [];
    for await (const file of glob("packages/*/package.json", {
      cwd: repoRoot,
    })) {
      const manifest = JSON.parse(
        await readFile(join(repoRoot, file), "utf8"),
      ) as { name: string; private?: boolean };
      if (manifest.private !== true) published.push(manifest.name);
    }
    const withPages = await Promise.all(
      packagePages.map(
        async ({ dir }) =>
          (
            JSON.parse(
              await readFile(join(repoRoot, dir, "package.json"), "utf8"),
            ) as { name: string }
          ).name,
      ),
    );
    const sections = [
      ...(await pageOf("other-packages")).matchAll(
        /<h2 id="[^"]+">([\s\S]*?)<\/h2>/g,
      ),
    ].map(([, heading = ""]) => text(heading));

    expect(sections.toSorted()).toEqual(
      published.filter((name) => !withPages.includes(name)).sort(),
    );
  });

  it("says which of them the hub and admin import, as their source does", async () => {
    const apps = join(repoRoot, "packages/create-robkit/templates/base/apps");
    const importers = async (name: string) => {
      const found: string[] = [];
      for (const app of ["hub", "admin"]) {
        for await (const file of glob("src/**/*.{ts,tsx}", {
          cwd: join(apps, app),
          exclude: ["**/*.test.{ts,tsx}"],
        })) {
          const source = await readFile(join(apps, app, file), "utf8");
          if (source.includes(`from "${name}`) && !found.includes(app)) {
            found.push(app);
          }
        }
      }
      return found;
    };
    const says = {
      "hub,admin": "The hub and admin import it",
      hub: "The hub imports it",
      admin: "Admin imports it",
    };
    const html = await pageOf("other-packages");

    for (const name of ["@robkit/input", "@robkit/guard", "@robkit/session"]) {
      const start = html.indexOf(`>${name}</h2>`);
      const section = text(html.slice(start, html.indexOf("<h2", start)));
      const found = (await importers(name)).join(",");
      const sentences = Object.entries(says)
        .filter(([apps]) => apps === found)
        .map(([, sentence]) => sentence);

      expect({
        name,
        says: Object.values(says).filter((each) => section.includes(each)),
      }).toEqual({ name, says: sentences });
    }
    expect(await importers("@robkit/input")).toEqual(["hub", "admin"]);
  });
});

const hasGo = spawnSync("go", ["version"]).status === 0;
const goModule = "github.com/RobertScholey98/robkit/go";

/** The exported names of one of the Go module's packages, as `go doc` prints them. */
function goExports(pkg: string): string[] {
  const printed = spawnSync("go", ["doc", "-all", `./${pkg}`], {
    cwd: join(repoRoot, "go"),
    encoding: "utf8",
  });
  expect(printed.stderr).toBe("");
  const names = [
    ...printed.stdout.matchAll(/^(?:func|type|const|var) ([A-Z]\w*)/gm),
    ...[
      ...printed.stdout.matchAll(/^(?:const|var) \(\n([\s\S]*?)^\)/gm),
    ].flatMap(([, block = ""]) => [...block.matchAll(/^\t([A-Z]\w*)\b/gm)]),
  ].map(([, name = ""]) => name);
  return names.toSorted();
}

describe.runIf(hasGo)("the reference page for the Go module", () => {
  it("lists the names go doc prints for each of its packages", async () => {
    expect(listedOn(await pageOf("go-module"))).toEqual({
      [`${goModule}/guard`]: goExports("guard"),
      [`${goModule}/session`]: goExports("session"),
    });
  });

  it("has an example that builds against the module in the repo", async () => {
    const example = codeBlocks(await pageOf("go-module")).find(
      ({ label }) => label === "main.go",
    );
    const dir = await mkdtemp(join(tmpdir(), "site-go-example-"));
    await writeFile(
      join(dir, "go.mod"),
      `module example\n\ngo 1.26.0\n\nrequire ${goModule} v0.0.0\n\nreplace ${goModule} => ${join(repoRoot, "go").replaceAll("\\", "/")}\n`,
    );
    await writeFile(join(dir, "main.go"), example?.code ?? "");

    const vetted = spawnSync("go", ["vet", "."], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GOFLAGS: "-mod=mod" },
    });

    expect(example).toBeDefined();
    expect(vetted.stderr).toBe("");
    expect(vetted.status).toBe(0);
  }, 120_000);
});
