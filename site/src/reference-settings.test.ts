// The reference page for settings, held to the code. Every ROBKIT_ name
// the published packages and the Go module read is on the page, found by a
// scan of their source. The names without that prefix are held by a list,
// each with the file that reads it. The refused names come from
// @robkit/dev's own list.

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { refusedAppSettings } from "@robkit/dev";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { built } from "./test/built.ts";

const page = "docs/reference/settings/index.html";

/** Each `ROBKIT_` name the source of the published packages and the Go module reads, leaving out tests and test helpers. */
async function robkitNamesInSource(): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>();
  for await (const file of glob(
    ["packages/*/src/**/*.{ts,tsx}", "go/**/*.go"],
    {
      cwd: repoRoot,
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.test-d.ts",
        "**/test/**",
        "**/*_test.go",
        "go/internal/fakecore/**",
        "go/internal/conformance/**",
      ],
    },
  )) {
    const text = await readFile(join(repoRoot, file), "utf8");
    for (const [name] of text.matchAll(/\bROBKIT_[A-Z][A-Z0-9_]*[A-Z0-9]\b/g)) {
      names.set(name, [...(names.get(name) ?? []), file.replaceAll("\\", "/")]);
    }
  }
  return names;
}

/** The settings without the `ROBKIT_` prefix, each with a file that reads it. */
const otherSettings = [
  {
    name: "<SLUG>_DATABASE_URL",
    file: "packages/create-robkit/src/deployment.ts",
    reads: /toUpperCase\(\)\}_DATABASE_URL`/,
  },
  { name: "COOLIFY_URL", file: "packages/create-robkit/src/env.ts" },
  { name: "COOLIFY_TOKEN", file: "packages/create-robkit/src/env.ts" },
  { name: "CF_ACCESS_CLIENT_ID", file: "packages/create-robkit/src/env.ts" },
  {
    name: "CF_ACCESS_CLIENT_SECRET",
    file: "packages/create-robkit/src/env.ts",
  },
  { name: "PORT", file: "packages/input/src/env.ts" },
  { name: "HOST", file: "packages/input/src/env.ts" },
  { name: "DATABASE_URL", file: "packages/input/src/env.ts" },
];

const text = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll(/&#39;|&#x27;|’/g, "'")
    .trim();

/** Each setting's section on the page, by the names its heading gives. */
async function settingSections(): Promise<{ names: string[]; body: string }[]> {
  return (await built(page))
    .split(/<h3 id="[^"]+">/)
    .slice(1)
    .map((section) => {
      const [heading = "", body = ""] = section.split("</h3>");
      return {
        names: [...heading.matchAll(/<code>([^<]+)<\/code>/g)].map(
          ([, name = ""]) => text(name),
        ),
        body,
      };
    });
}

describe("the reference page for settings", () => {
  it("has a section for each ROBKIT_ name the code reads, and no other", async () => {
    const inSource = await robkitNamesInSource();
    const onPage = (await settingSections())
      .flatMap(({ names }) => names)
      .filter((name) => name.startsWith("ROBKIT_"));

    expect(inSource.get("ROBKIT_APP")).toContain("go/session/options.go");
    expect([...inSource.keys()]).not.toContain("ROBKIT_TEST_TAG");
    expect(onPage.toSorted()).toEqual([...inSource.keys()].sort());
  });

  it("has a section for each other setting the test lists, which its file reads", async () => {
    for (const { name, file, reads } of otherSettings) {
      const source = await readFile(join(repoRoot, file), "utf8");
      expect({
        name,
        read: (reads ?? new RegExp(`(?<![A-Z_])${name}(?![A-Z_])`)).test(
          source,
        ),
      }).toEqual({ name, read: true });
    }
    const onPage = (await settingSections())
      .flatMap(({ names }) => names)
      .filter((name) => !name.startsWith("ROBKIT_"));

    expect(onPage.toSorted()).toEqual(
      otherSettings.map(({ name }) => name).sort(),
    );
  });

  it("says who sets each setting, and its value in dev and in production", async () => {
    for (const { names, body } of await settingSections()) {
      const labels = [...body.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(
        ([, label]) => label,
      );
      expect({ names, labels }).toEqual({
        names,
        labels: ["Who sets it.", "In dev.", "In production."],
      });
    }
  });

  it("lists the names an app's .env can't set from @robkit/dev's list", async () => {
    const html = await built(page);
    const list = /<ul data-refused[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
    const items = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(
      ([, item = ""]) => /<code[^>]*>([^<]+)<\/code>/.exec(item)?.[1],
    );
    const { decidedForEachApp, prefix, alsoRefused } = refusedAppSettings;

    expect(items).toEqual([...decidedForEachApp, prefix, ...alsoRefused]);
  });
});
