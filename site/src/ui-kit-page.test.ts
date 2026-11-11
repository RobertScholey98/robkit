// Holds the page on the UI kit to the files an install gets: the command
// in the kit's AGENTS.md, the files and variables it names, and the
// imports it shows. Turbo runs the site's build before its tests.

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { built, codeBlocks } from "./test/built.ts";

const page = "docs/build-an-app/the-ui-kit/index.html";
const templates = join(repoRoot, "packages/create-robkit/templates");
const base = join(templates, "base");

const unescape = (text: string) =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

/** The text of each inline `<code>` on the page, outside code blocks. */
async function inlineCode(): Promise<string[]> {
  const html = (await built(page)).replaceAll(
    /<figure class="code"[\s\S]*?<\/figure>/g,
    "",
  );
  return [...html.matchAll(/<code>([^<]+)<\/code>/g)].map(([, code = ""]) =>
    unescape(code),
  );
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

describe("the built page on the UI kit", () => {
  it("adds a component the kit lacks with the kit's own command, from its folder", async () => {
    const agents = await readFile(join(base, "packages/ui/AGENTS.md"), "utf8");
    const command = /^## Adding a component\n[\s\S]*?```sh\n(.+)\n```/m.exec(
      agents,
    )?.[1];
    const terminal = codeBlocks(await built(page))
      .filter(({ label }) => label === "Terminal")
      .map(({ code }) => code);
    const [, component = ""] =
      /^cd packages\/ui\npnpm exec shadcn add (\S+)$/m.exec(
        terminal.join("\n"),
      ) ?? [];

    expect(command).toBe("pnpm exec shadcn add <component>");
    expect(terminal).toContain(
      `cd packages/ui\n${String(command).replace("<component>", component)}`,
    );
    expect(component).toMatch(/^[a-z-]+$/);
    expect(
      await exists(
        join(base, "packages/ui/src/components/ui", `${component}.tsx`),
      ),
    ).toBe(false);
  });

  it("names only files and folders an install has", async () => {
    const paths = (await inlineCode()).filter(
      (code) =>
        /^\w[\w.-]*(\/[\w.-]+)*\/?$/.test(code) && /\/|\w\.\w/.test(code),
    );
    const missing: string[] = [];
    for (const path of paths) {
      // A path from an app's folder is in every stack's template.
      const inBase = await exists(join(base, path));
      const inStacks = await Promise.all(
        readyStacks.map((stack) =>
          exists(join(templates, "stacks", stack, path)),
        ),
      );
      const inUi = await exists(join(base, "packages/ui", path));
      if (!inBase && !inStacks.every(Boolean) && !inUi) missing.push(path);
    }

    expect(paths).toEqual(
      expect.arrayContaining([
        "packages/ui",
        "packages/theme/theme.css",
        "src/components/ui",
        "src/styles.css",
        "pnpm-workspace.yaml",
        "apps/hub/src/ui.tsx",
        "apps/admin/src/client/ui.tsx",
      ]),
    );
    expect(missing).toEqual([]);
  });

  it("names only variables the theme has", async () => {
    const theme = await readFile(
      join(base, "packages/theme/theme.css"),
      "utf8",
    );
    const variables = (await inlineCode()).filter((code) =>
      code.startsWith("--"),
    );

    expect(variables.length).toBeGreaterThan(3);
    for (const variable of variables) {
      expect(theme, variable).toContain(`${variable}:`);
    }
  });

  it("shows imports an app's template has, from the kit's exports", async () => {
    const kit = JSON.parse(
      await readFile(join(base, "packages/ui/package.json"), "utf8"),
    ) as { exports: Record<string, string> };
    const blocks = codeBlocks(await built(page));
    const imports = blocks.filter(({ code }) =>
      code.includes('from "@internal/ui/'),
    );
    const home = await readFile(
      join(templates, "stacks/start/src/home.tsx"),
      "utf8",
    );
    const specifiers = [
      ...imports.flatMap(({ code }) => [
        ...code.matchAll(/from "(@internal\/ui\/[^"]+)"/g),
      ]),
      ...(await inlineCode()).flatMap((code) => [
        ...code.matchAll(/^(@internal\/ui\/.+)$/g),
      ]),
    ].map(([, specifier = ""]) => specifier.replace("<name>", "button"));
    const exported = Object.keys(kit.exports).map((key) =>
      key.replace(/^\./, "@internal/ui"),
    );

    expect(imports.map(({ label }) => label)).toEqual([
      "apps/example/src/home.tsx",
    ]);
    for (const { code } of imports) expect(home).toContain(code);
    expect(specifiers.length).toBeGreaterThan(2);
    for (const specifier of specifiers) {
      expect(
        exported.some(
          (key) =>
            key === specifier ||
            (key.endsWith("*") && specifier.startsWith(key.slice(0, -1))),
        ),
        specifier,
      ).toBe(true);
    }
  });
});
