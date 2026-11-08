import { describe, expect, it } from "vitest";
import { defaultChoices, type Choices } from "./choices.ts";
import { generateInstall, type Files } from "./generate.ts";

/** A Tailwind colour from its own palette, rather than a theme token. */
const paletteColour =
  /\b(?:bg|text|border|ring|outline|divide|fill|stroke|placeholder|from|via|to|shadow|accent|caret|decoration)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)\b/g;

/** A line that sets one of the theme's colour or radius tokens. */
const tokenSetting = /^\s*--(?:background|foreground|primary|radius)\s*:/m;

const platformApps = { hub: "apps/hub/src/", admin: "apps/admin/src/" };

function filesUnder(files: Files, prefix: string, extension: string) {
  return [...files].filter(
    ([path]) => path.startsWith(prefix) && path.endsWith(extension),
  );
}

describe("the install's theme tokens", () => {
  const choices: Choices = defaultChoices;

  describe("in the default install", () => {
    it("sets them in packages/theme and nowhere else", async () => {
      const files = await generateInstall(choices);
      const setters = [...files]
        .filter(
          ([path, text]) => path.endsWith(".css") && tokenSetting.test(text),
        )
        .map(([path]) => path);

      expect(setters).toEqual(["packages/theme/theme.css"]);
    });

    it.each(Object.entries(platformApps))(
      "styles the %s with the tokens, not Tailwind's palette",
      async (_app, folder) => {
        const files = await generateInstall(choices);
        const palette = filesUnder(files, folder, ".tsx").flatMap(
          ([path, text]) =>
            [...text.matchAll(paletteColour)].map(
              ([match]) => `${path}: ${match}`,
            ),
        );
        expect(palette).toEqual([]);
        expect(stylesheetsRead(files, folder)).toContain(
          "packages/theme/theme.css",
        );
      },
    );
  });
});

/** The file an `@internal/<package>/<subpath>` import names, if any. */
function resolve(files: Files, specifier: string): string | undefined {
  const [, name, subpath] = /^(@internal\/[^/]+)\/(.+)$/.exec(specifier) ?? [];
  if (name === undefined || subpath === undefined) return undefined;
  for (const [path, text] of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(path)) continue;
    const manifest = JSON.parse(text) as {
      name: string;
      exports?: Record<string, string>;
    };
    const target = manifest.exports?.[`./${subpath}`];
    if (manifest.name === name && target !== undefined) {
      return `${path.slice(0, -"package.json".length)}${target.slice(2)}`;
    }
  }
  return undefined;
}

/**
 * Every stylesheet of the install's own that the app's CSS reads, following
 * imports through the install's packages.
 */
function stylesheetsRead(files: Files, folder: string): string[] {
  const read = new Set<string>();
  const follow = (text: string) => {
    for (const [, specifier = ""] of text.matchAll(/@import\s+"([^"]+)"/g)) {
      const path = resolve(files, specifier);
      if (path === undefined || read.has(path)) continue;
      read.add(path);
      follow(files.get(path) ?? "");
    }
  };
  for (const [, text] of filesUnder(files, folder, ".css")) follow(text);
  return [...read];
}
