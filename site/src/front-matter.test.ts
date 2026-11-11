// A page's front matter says where it belongs. A page that leaves out its
// title or section stops the build, and the message names the page's file.
// Each case runs `astro sync` on a throwaway copy of the site's config.

import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";

const site = join(repoRoot, "site");
const astro = join(
  dirname(
    createRequire(join(site, "package.json")).resolve("astro/package.json"),
  ),
  "bin",
  "astro.mjs",
);
// Under site/, so the copy finds the site's packages. Git and ESLint
// ignore .fixtures/.
const fixtures = join(site, ".fixtures");

beforeAll(async () => {
  await rm(fixtures, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(fixtures, { recursive: true, force: true });
});

/** Runs `astro sync` over one page with `frontMatter`, and returns what it printed. */
async function syncPage(name: string, frontMatter: string) {
  const root = join(fixtures, name);
  const file = join(root, "src", "content", "docs", `${name}.mdx`);
  await mkdir(dirname(file), { recursive: true });
  for (const source of [
    "astro.config.ts",
    "src/content.config.ts",
    "src/navigation.ts",
    "src/code.ts",
    "src/docs-page.ts",
    "src/markdown.ts",
    "src/dist.ts",
    "src/markdown-copies.ts",
    "src/sitemap.ts",
    "src/built.ts",
    "src/repo-markdown.ts",
    "src/repo.ts",
    "src/search.ts",
    "src/search-index.ts",
    "src/site.ts",
  ]) {
    await cp(join(site, source), join(root, source));
  }
  await writeFile(file, `---\n${frontMatter}\n---\n\nA page.\n`);
  const run = await new Promise<{ failed: boolean; output: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [astro, "sync", "--root", root],
        {
          cwd: root,
          env: {
            ...process.env,
            ASTRO_TELEMETRY_DISABLED: "1",
            NO_COLOR: "1",
          },
          // Once, on Windows, a sync never finished. Stop it well before
          // the test's own limit, so the failure shows how far it got.
          timeout: 45_000,
        },
        (error, stdout, stderr) => {
          const stopped =
            error?.killed === true ? "astro sync was stopped after 45s.\n" : "";
          resolve({
            failed: error !== null,
            output: stopped + stdout + stderr,
          });
        },
      );
    },
  );
  return { ...run, file };
}

// Each case starts Astro, which takes a few seconds.
describe("a page's front matter", { timeout: 60_000 }, () => {
  it.each([
    // Astro words the two differently: a section must be one of a list.
    ["section", "title: No section\ndescription: A page.", "section: Invalid"],
    ["title", "description: A page.\nsection: Concepts", "title: Required"],
  ])(
    "stops the build without a %s, naming the file",
    async (field, data, message) => {
      const { failed, output, file } = await syncPage(`no-${field}`, data);

      expect(failed).toBe(true);
      expect(output).toContain(file);
      expect(output).toContain(message);
    },
  );

  it("stops the build on a section the sidebar lacks", async () => {
    const { failed, output, file } = await syncPage(
      "odd-section",
      "title: Odd\ndescription: A page.\nsection: Elsewhere",
    );

    expect(failed).toBe(true);
    expect(output).toContain(file);
    expect(output).toContain(
      'section: Invalid option: expected one of "Get started"',
    );
  });
});
