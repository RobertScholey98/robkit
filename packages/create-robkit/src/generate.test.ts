import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { defaultChoices, type Choices } from "./choices.ts";
import { generateInstall, type Files } from "./generate.ts";

function json(files: Files, path: string): unknown {
  return JSON.parse(files.get(path) ?? "null");
}

function workspace(files: Files) {
  return parse(files.get("pnpm-workspace.yaml") ?? "", {
    schema: "failsafe",
  }) as {
    catalog: Record<string, string>;
    overrides?: Record<string, string>;
  };
}

const honoFirst: Choices = {
  ...defaultChoices,
  generators: ["react-hono", "start"],
};

describe("generateInstall", () => {
  it("writes the default install", async () => {
    const files = await generateInstall(defaultChoices);

    // Every path, and the text of each file the generator renders rather
    // than copies from one template.
    expect([...files.keys()]).toMatchSnapshot();
    for (const path of [
      "robkit.json",
      "pnpm-workspace.yaml",
      "package.json",
      "apps/example/package.json",
    ]) {
      expect(files.get(path)).toMatchSnapshot(path);
    }
  });

  it("records every choice in robkit.json", async () => {
    const files = await generateInstall(honoFirst);

    expect(files.get("robkit.json")).toBe(`{
  "packageManager": "pnpm",
  "orm": "drizzle",
  "uiKit": null,
  "tools": ["eslint-prettier"],
  "generators": ["react-hono", "start"]
}
`);
  });

  it("adds the example app from the first generator", async () => {
    const start = await generateInstall(defaultChoices);
    const hono = await generateInstall(honoFirst);

    expect(start.has("apps/example/src/routes/index.tsx")).toBe(true);
    expect(start.has("apps/example/src/server.tsx")).toBe(false);
    expect(hono.has("apps/example/src/server.tsx")).toBe(true);
    expect(hono.has("apps/example/src/routes/index.tsx")).toBe(false);
    expect(json(hono, "apps/example/package.json")).toMatchObject({
      name: "@internal/example-app",
      dependencies: { "@robkit/hono": "catalog:" },
    });
  });

  it("merges each layer's scripts and dependencies into the root manifest", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "package.json")).toEqual({
      private: true,
      type: "module",
      engines: { node: ">=24" },
      scripts: {
        dev: "robkit-dev",
        typecheck: "turbo run typecheck",
        test: "turbo run test",
        lint: "eslint .",
        format: "prettier --write .",
        "format:check": "prettier --check .",
      },
      devDependencies: {
        "@robkit/dev": "catalog:",
        turbo: "catalog:",
        typescript: "catalog:",
        "@eslint/js": "catalog:",
        eslint: "catalog:",
        globals: "catalog:",
        prettier: "catalog:",
        "typescript-eslint": "catalog:",
      },
      packageManager: "pnpm@11.28.9",
    });
  });

  it("pins every catalog dependency at robkit's version", async () => {
    const { catalog, overrides } = workspace(
      await generateInstall(defaultChoices),
    );

    expect(catalog).toMatchObject({
      "@robkit/core": "0.0.0",
      "@robkit/dev": "0.0.0",
      "@robkit/start": "0.0.0",
      "@tanstack/react-start": "1.169.4",
      hono: "4.13.14",
      prettier: "3.9.10",
    });
    // Only what the install uses: robkit's own tooling stays out.
    expect(catalog).not.toHaveProperty("drizzle-kit");
    expect(catalog).not.toHaveProperty("playwright");
    expect(overrides).toBeUndefined();
  });

  it("links the @robkit packages to this checkout when asked", async () => {
    const { overrides } = workspace(
      await generateInstall(defaultChoices, { link: true }),
    );
    const checkout = fileURLToPath(new URL("../../../", import.meta.url));
    const at = (dir: string) =>
      `link:${checkout.replaceAll("\\", "/")}packages/${dir}`;

    expect(overrides).toEqual({
      "@robkit/core": at("core"),
      "@robkit/dev": at("dev"),
      "@robkit/guard": at("guard"),
      "@robkit/hono": at("hono"),
      "@robkit/react": at("react"),
      "@robkit/start": at("start"),
    });
  });

  it("restores the dotfiles npm would drop", async () => {
    const files = await generateInstall(defaultChoices);

    expect(files.get(".gitignore")).toContain("node_modules/");
    expect(files.has("gitignore")).toBe(false);
  });
});
