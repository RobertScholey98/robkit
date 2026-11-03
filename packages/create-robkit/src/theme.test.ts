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
  const installs: [string, Choices][] = [["no UI kit", defaultChoices]];

  describe.each(installs)("with %s", (_, choices) => {
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
      async (app, folder) => {
        const files = await generateInstall(choices);
        const palette = filesUnder(files, folder, ".tsx").flatMap(
          ([path, text]) =>
            [...text.matchAll(paletteColour)].map(
              ([match]) => `${path}: ${match}`,
            ),
        );
        const manifest = JSON.parse(
          files.get(`apps/${app}/package.json`) ?? "{}",
        ) as { dependencies: Record<string, string> };

        expect(palette).toEqual([]);
        expect(stylesheetImports(files, folder)).toContain(
          "@internal/theme/theme.css",
        );
        expect(manifest.dependencies["@internal/theme"]).toBe("workspace:*");
      },
    );
  });
});

/** Every stylesheet the app's own CSS imports. */
function stylesheetImports(files: Files, folder: string): string[] {
  return filesUnder(files, folder, ".css").flatMap(([, text]) =>
    [...text.matchAll(/@import\s+"([^"]+)"/g)].map(([, name]) => name ?? ""),
  );
}
