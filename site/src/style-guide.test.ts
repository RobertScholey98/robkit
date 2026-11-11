// The style guide, site/DESIGN.md, is the one source for the site's look.
// tokens.css holds its values, and nothing else names a colour.

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";

const site = join(repoRoot, "site");
const tokensFile = "src/styles/tokens.css";

interface Token {
  light: string;
  dark?: string;
}

const normal = (value: string) =>
  value.trim().toLowerCase().replaceAll(/\s+/g, " ");

/** Each token a row of the guide's tables gives, as `| `--x` | `light` | `dark` |`. */
function guideTokens(markdown: string): Map<string, Token> {
  const tokens = new Map<string, Token>();
  for (const [, name, light, dark] of markdown.matchAll(
    /^\|\s*`(--[\w-]+)`\s*\|\s*`([^`]+)`\s*\|(?:\s*`([^`]+)`\s*\|)?/gm,
  )) {
    if (name === undefined || light === undefined) continue;
    tokens.set(
      name,
      dark === undefined
        ? { light: normal(light) }
        : { light: normal(light), dark: normal(dark) },
    );
  }
  return tokens;
}

/** The declarations of each `:root` rule in a stylesheet, by its selector. */
function rootRules(css: string): [string, Map<string, string>][] {
  return [...css.matchAll(/(:root[^{]*)\{([^}]*)\}/g)].map(
    ([, selector = "", body = ""]) => [
      selector.trim(),
      new Map(
        [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
          ([, name = "", value = ""]) => [name, normal(value)],
        ),
      ),
    ],
  );
}

/** The colours a stylesheet or component names outright. */
function rawColours(text: string): string[] {
  return [
    ...text.matchAll(
      /(?<!href=["'])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi,
    ),
  ].map(([match]) => match);
}

describe("rawColours", () => {
  it("finds a hex colour and a colour function", () => {
    expect(
      rawColours(
        'a { color: #FFF; background: rgb(0 0 0); fill: hsl(1 2% 3%) }<path fill="#0f172a"/>',
      ),
    ).toEqual(["#FFF", "rgb(", "hsl(", "#0f172a"]);
  });

  it("leaves a link to an anchor alone", () => {
    expect(
      rawColours('<a href="#add">Add</a> <a href="#main">Skip</a>'),
    ).toEqual([]);
  });
});

describe("the style guide", () => {
  it("has the values tokens.css holds, in both themes, and no other", async () => {
    const guide = guideTokens(await readFile(join(site, "DESIGN.md"), "utf8"));
    const rules = rootRules(await readFile(join(site, tokensFile), "utf8"));
    const base = rules[0];
    if (base === undefined) throw new Error(`${tokensFile} has no :root rule`);
    const dark = rules.filter(([selector]) =>
      /data-theme="(dark|light)"/.test(selector),
    );

    expect(guide.size).toBeGreaterThan(40);
    expect(dark).toHaveLength(2);
    const problems: string[] = [];
    for (const [name, { light, dark: darkValue }] of guide) {
      if (base[1].get(name) !== light) {
        problems.push(
          `${name} is ${String(base[1].get(name))} in light, not ${light}`,
        );
      }
      for (const [selector, declarations] of dark) {
        if (darkValue !== undefined && declarations.get(name) !== darkValue) {
          problems.push(
            `${name} is ${String(declarations.get(name))} under ${selector}, not ${darkValue}`,
          );
        }
      }
    }
    for (const [selector, declarations] of [base, ...dark]) {
      for (const name of declarations.keys()) {
        if (!guide.has(name))
          problems.push(`${selector} sets ${name}, which DESIGN.md lacks`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("is the only place a stylesheet or component names a colour", async () => {
    const found: string[] = [];
    for await (const file of glob("src/**/*.{css,astro,ts,tsx,js,mdx}", {
      cwd: site,
      exclude: [tokensFile, "src/**/*.test.ts"],
    })) {
      const text = await readFile(join(site, file), "utf8");
      for (const colour of rawColours(text)) found.push(`${file}: ${colour}`);
    }

    expect(found).toEqual([]);
  });
});
