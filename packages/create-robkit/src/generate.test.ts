import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  choiceTable,
  defaultChoices,
  readyOptions,
  type Choice,
  type Choices,
  type Option,
} from "./choices.ts";
import { layerRule } from "./check.ts";
import { generateInstall, stackTemplate, type Files } from "./generate.ts";

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
  "tools": ["eslint-prettier", "vitest"],
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

  it("gives the example app the icon robkit add gives an app by default", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "apps/example/package.json")).toMatchObject({
      robkit: { icon: "📦" },
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
        build: "turbo run build",
        lint: "robkit check && eslint .",
        format: "prettier --write .",
        "format:check": "prettier --check .",
        robkit: "robkit",
      },
      devDependencies: {
        "@robkit/dev": "catalog:",
        "create-robkit": "catalog:",
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

  it("states each rule robkit check enforces in the root AGENTS.md", async () => {
    const files = await generateInstall(defaultChoices);
    const agents = files.get("AGENTS.md") ?? "";

    for (const { rule } of layerRule) {
      const stated = rule.replace(/^Layer rule: (.)/, (_, first: string) =>
        first.toUpperCase(),
      );
      expect(agents).toContain(`- ${stated}`);
    }
    expect(files.get("CLAUDE.md")).toBe("@AGENTS.md\n");
  });

  it("writes a CI job that deploys main once its checks pass", async () => {
    const files = await generateInstall(defaultChoices);
    const workflow = parse(files.get(".github/workflows/ci.yml") ?? "") as {
      jobs: Record<
        string,
        {
          if?: string;
          needs?: string;
          steps: { run?: string; env?: Record<string, string> }[];
        }
      >;
    };

    const deploy = workflow.jobs.deploy;

    expect(deploy?.needs).toBe("check");
    expect(deploy?.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(deploy?.steps.flatMap((step) => step.run ?? [])).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm robkit deploy",
    ]);
    expect(Object.keys(deploy?.steps.at(-1)?.env ?? {})).toEqual([
      "TURBO_SCM_BASE",
      "COOLIFY_URL",
      "COOLIFY_TOKEN",
      "CF_ACCESS_CLIENT_ID",
      "CF_ACCESS_CLIENT_SECRET",
    ]);
  });

  it("writes a CI workflow that installs, then runs the install's own scripts", async () => {
    const files = await generateInstall(defaultChoices);
    const workflow = parse(files.get(".github/workflows/ci.yml") ?? "") as {
      jobs: Record<string, { steps: { run?: string }[] }>;
    };
    const { scripts } = json(files, "package.json") as {
      scripts: Record<string, string>;
    };

    const runs = workflow.jobs.check?.steps.flatMap((step) => step.run ?? []);

    expect(runs).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm run --if-present format:check",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
    ]);
    expect(Object.keys(scripts)).toEqual(
      expect.arrayContaining([
        "lint",
        "format:check",
        "typecheck",
        "test",
        "build",
      ]),
    );
  });

  it("lints with robkit check, without ESLint too", async () => {
    const withEslint = await generateInstall(defaultChoices);
    const without = await generateInstall({ ...defaultChoices, tools: [] });

    expect(
      [withEslint, without].map(
        (files) => (json(files, "package.json") as { scripts: object }).scripts,
      ),
    ).toMatchObject([
      { lint: "robkit check && eslint ." },
      { lint: "robkit check" },
    ]);
  });

  it("tells the root AGENTS.md about each dev tool the install has", async () => {
    const tools: readonly Option[] = readyOptions(choiceTable.tools);
    const all = await generateInstall({
      ...defaultChoices,
      tools: tools.map((tool) => tool.value) as Choices["tools"],
    });
    const none = await generateInstall({ ...defaultChoices, tools: [] });
    const agents = all.get("AGENTS.md") ?? "";

    expect(agents).toContain("\n## Dev tools\n\n");
    for (const { value, guide } of tools) {
      expect(guide, value).toBeDefined();
      const text = await readFile(
        new URL(`../templates/${guide ?? ""}`, import.meta.url),
        "utf8",
      );
      expect(agents, value).toContain(text.replaceAll("\r\n", "\n"));
    }
    expect(none.get("AGENTS.md")).not.toContain("## Dev tools");
    expect(none.get("AGENTS.md")).not.toContain("Vitest");
  });

  describe("with Vitest off", () => {
    const isTestFile = (path: string) =>
      /\.test\.tsx?$|(^|\/)vitest\.config\.ts$/.test(path);

    it.each<[string, Choices]>([
      ["no kit", { ...defaultChoices, tools: ["eslint-prettier"] }],
      ["Chakra", { ...defaultChoices, tools: [], uiKit: "chakra" }],
    ])("leaves the tests and their runner out, with %s", async (_, choices) => {
      const files = await generateInstall(choices);

      expect([...files.keys()].filter(isTestFile)).toEqual([]);
      for (const [path, text] of files) {
        if (!path.endsWith("package.json")) continue;
        expect(text, path).not.toContain("vitest");
      }
      expect(workspace(files).catalog).not.toHaveProperty("vitest");
      // The root still has a test script, which runs no tasks.
      expect(json(files, "package.json")).toMatchObject({
        scripts: { test: "turbo run test" },
      });
    });

    it("keeps them when Vitest is on", async () => {
      const files = await generateInstall({
        ...defaultChoices,
        tools: ["vitest"],
        uiKit: "chakra",
      });

      expect([...files.keys()].filter(isTestFile)).toEqual(
        expect.arrayContaining([
          "apps/admin/vitest.config.ts",
          "apps/hub/src/core-api.test.ts",
          "packages/core-client/src/call-core.test.ts",
          "packages/ui/src/provider.test.tsx",
        ]),
      );
      expect(json(files, "apps/hub/package.json")).toMatchObject({
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "catalog:" },
      });
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
      "create-robkit": "0.0.0",
      "drizzle-orm": "0.45.4",
      hono: "4.13.14",
      prettier: "3.9.10",
    });
    // Only what the install uses: robkit's own tooling stays out.
    expect(catalog).not.toHaveProperty("@clack/prompts");
    expect(catalog).not.toHaveProperty("playwright");
    expect(overrides).toBeUndefined();
  });

  it("catalogs every stack robkit add offers, not only the example's", async () => {
    const { catalog } = workspace(await generateInstall(honoFirst));

    expect(catalog).toMatchObject({
      "@robkit/start": "0.0.0",
      "@tanstack/react-start": "1.169.4",
    });
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
      "@robkit/session": at("session"),
      "@robkit/start": at("start"),
      "create-robkit": at("create-robkit"),
    });
  });

  it("restores the dotfiles npm would drop", async () => {
    const files = await generateInstall(defaultChoices);

    expect(files.get(".gitignore")).toContain("node_modules/");
    expect(files.has("gitignore")).toBe(false);
  });

  it("has a template folder for every layer the choice table names", async () => {
    const table: Choice[] = Object.values(choiceTable);
    const layers = table.flatMap((choice) =>
      readyOptions(choice).flatMap((option) => option.layer ?? []),
    );

    expect(layers).toContain("stacks/start");
    for (const layer of layers) {
      const dir = new URL(`../templates/${layer}/`, import.meta.url);
      expect((await stat(dir)).isDirectory(), layer).toBe(true);
    }
    for (const stack of readyOptions(choiceTable.generators)) {
      expect(stack.layer, stack.value).toBeDefined();
    }
    for (const kit of readyOptions(choiceTable.uiKit)) {
      if (kit.optInLayer === undefined) continue;
      for (const stack of readyOptions(choiceTable.generators)) {
        const dir = new URL(
          `../templates/${kit.optInLayer}/${stack.value}/`,
          import.meta.url,
        );
        expect(
          (await stat(dir)).isDirectory(),
          `${kit.value} ${stack.value}`,
        ).toBe(true);
      }
    }
    for (const orm of readyOptions(choiceTable.orm)) {
      const appLayer = new URL(
        `../templates/${orm.appLayer ?? ""}/`,
        import.meta.url,
      );
      expect((await stat(appLayer)).isDirectory(), orm.value).toBe(true);
      const guide = new URL(
        `../templates/${orm.appGuide ?? ""}`,
        import.meta.url,
      );
      expect((await stat(guide)).isFile(), orm.value).toBe(true);
    }
  });

  it.each([
    ["start", "context.viewer"],
    ["react-hono", "c.var.viewer"],
  ] as const)(
    "gives a %s app an AGENTS.md for its stack and the ORM, which CLAUDE.md points at",
    async (stack, viewer) => {
      const files = await stackTemplate(stack, "drizzle");
      const agents = files.get("AGENTS.md") ?? "";
      const ormSection = await readFile(
        new URL("../templates/orms/drizzle/AGENTS.md", import.meta.url),
        "utf8",
      );

      // How to read the viewer, call core and add a migration.
      expect(agents).toContain(`read who is asking as \`${viewer}\``);
      expect(agents).toContain(
        "over HTTP from the server at `process.env.ROBKIT_CORE_URL`",
      );
      expect(agents).toContain("`src/migrate.ts` applies the migrations");
      expect(agents.endsWith(ormSection.replaceAll("\r\n", "\n"))).toBe(true);
      expect(files.get("CLAUDE.md")).toBe("@AGENTS.md\n");
    },
  );

  it.each(["start", "react-hono"] as const)(
    "lays the ORM's app files over a %s app",
    async (stack) => {
      const files = await stackTemplate(stack, "drizzle");
      const manifest = JSON.parse(files.get("package.json") ?? "{}") as {
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
      };

      expect(files.has("src/migrate.ts")).toBe(true);
      expect(files.has("src/visits.ts")).toBe(true);
      expect(files.has("drizzle/0000_init.sql")).toBe(true);
      expect(manifest.scripts.migrate).toBe("node src/migrate.ts");
      expect(manifest.dependencies["drizzle-orm"]).toBe("catalog:");
      expect(manifest.scripts.start).toMatch(/^node --run migrate && /);
    },
  );

  it("lays Prisma's app files over a Prisma install's apps, and lets its engines install", async () => {
    const files = await generateInstall({ ...defaultChoices, orm: "prisma" });
    const manifest = JSON.parse(
      files.get("apps/example/package.json") ?? "{}",
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    const { catalog } = workspace(files);
    const { allowBuilds } = parse(files.get("pnpm-workspace.yaml") ?? "") as {
      allowBuilds: Record<string, boolean>;
    };

    expect(files.has("apps/example/prisma/schema.prisma")).toBe(true);
    expect(files.has("apps/example/src/generated/prisma/client.ts")).toBe(true);
    expect(files.has("apps/example/drizzle/0000_init.sql")).toBe(false);
    expect(manifest.scripts.migrate).toBe("prisma migrate deploy");
    expect(manifest.dependencies).toMatchObject({
      "@prisma/adapter-pg": "catalog:",
      "@prisma/client": "catalog:",
      prisma: "catalog:",
    });
    expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
    expect(catalog).toMatchObject({ prisma: "7.10.1" });
    expect(allowBuilds).toEqual({
      esbuild: false,
      "@prisma/engines": true,
      prisma: false,
    });
    expect(files.get("apps/example/AGENTS.md")).toContain("pnpm db:migration");
  });

  it("lays Kysely's app files over a Kysely install's apps", async () => {
    const files = await generateInstall({ ...defaultChoices, orm: "kysely" });
    const manifest = JSON.parse(
      files.get("apps/example/package.json") ?? "{}",
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const { catalog } = workspace(files);

    expect(files.has("apps/example/src/migrations/0001_visit.ts")).toBe(true);
    expect(files.has("apps/example/drizzle/0000_init.sql")).toBe(false);
    expect(manifest.scripts.migrate).toBe("node src/migrate.ts");
    expect(manifest.dependencies).toEqual(
      expect.objectContaining({ kysely: "catalog:", pg: "catalog:" }),
    );
    expect(manifest.devDependencies).toMatchObject({ "@types/pg": "catalog:" });
    expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
    expect(catalog).toMatchObject({ kysely: "0.29.8", pg: "8.23.1" });
    expect(files.get("apps/example/AGENTS.md")).toContain(
      "src/migrations/index.ts",
    );
  });

  it("lays a UI kit's packages/ui and controls over the no-kit hub and admin", async () => {
    const plain = await generateInstall(defaultChoices);
    const kit = await generateInstall({
      ...defaultChoices,
      uiKit: "shadcn-base-ui",
    });
    const hub = json(kit, "apps/hub/package.json") as {
      dependencies: Record<string, string>;
    };
    const { catalog } = workspace(kit);

    expect(
      [...plain.keys()].some((path) => path.startsWith("packages/ui/")),
    ).toBe(false);
    expect(kit.has("packages/ui/src/components/ui/button.tsx")).toBe(true);
    // Only the install: the kit keeps its apps' files out of it.
    expect(
      [...kit.keys()].filter(
        (path) =>
          !/^(?:apps|packages|tooling|docs|\.github)\/|^[^/]+$/.test(path),
      ),
    ).toEqual([]);
    expect(kit.get("apps/hub/src/ui.tsx")).toContain(
      'from "@internal/ui/components/ui/button"',
    );
    expect(kit.get("apps/admin/src/client/ui.tsx")).toContain(
      'from "@internal/ui/components/ui/checkbox"',
    );
    // The screens are the no-kit ones; only their controls change.
    expect(kit.get("apps/hub/src/forms.tsx")).toBe(
      plain.get("apps/hub/src/forms.tsx"),
    );
    expect(kit.get("apps/admin/src/client/Admin.tsx")).toBe(
      plain.get("apps/admin/src/client/Admin.tsx"),
    );
    expect(hub.dependencies["@internal/ui"]).toBe("workspace:*");
    // The example app shows the kit off; robkit add asks each app.
    expect(kit.get("apps/example/src/styles.css")).toContain(
      "@internal/ui/styles.css",
    );
    expect(plain.has("apps/example/src/styles.css")).toBe(false);
    expect(catalog).toMatchObject({
      "@base-ui/react": "1.9.0",
      shadcn: "4.23.0",
    });
  });

  it("lays shadcn on Radix the same way, drawing on radix-ui", async () => {
    const baseUi = await generateInstall({
      ...defaultChoices,
      uiKit: "shadcn-base-ui",
    });
    const radix = await generateInstall({
      ...defaultChoices,
      uiKit: "shadcn-radix",
    });
    const ui = json(radix, "packages/ui/package.json") as {
      dependencies: Record<string, string>;
    };
    const { catalog } = workspace(radix);

    expect(ui.dependencies).toHaveProperty("radix-ui", "catalog:");
    expect(ui.dependencies).not.toHaveProperty("@base-ui/react");
    expect(catalog).toMatchObject({ "radix-ui": "1.8.1" });
    expect(catalog).not.toHaveProperty("@base-ui/react");
    expect(radix.get("packages/ui/src/components/ui/checkbox.tsx")).toContain(
      'from "radix-ui"',
    );
    // Both shadcn kits share the screens, the theme and the app layer.
    for (const path of [
      "apps/hub/src/forms.tsx",
      "apps/admin/src/client/Admin.tsx",
      "packages/theme/theme.css",
      "apps/example/src/styles.css",
    ]) {
      expect(radix.get(path)).toBe(baseUi.get(path));
    }
  });

  it("lays Chakra over the same screens, with its own packages/ui and app layer", async () => {
    const plain = await generateInstall(defaultChoices);
    const chakra = await generateInstall({
      ...defaultChoices,
      uiKit: "chakra",
    });
    const ui = json(chakra, "packages/ui/package.json") as {
      dependencies: Record<string, string>;
    };
    const { catalog } = workspace(chakra);

    expect(ui.dependencies).toMatchObject({
      "@chakra-ui/react": "catalog:",
      "@emotion/react": "catalog:",
    });
    expect(catalog).toMatchObject({
      "@chakra-ui/react": "3.37.0",
      "@emotion/react": "11.14.0",
    });
    expect(catalog).not.toHaveProperty("shadcn");
    expect(chakra.has("packages/ui/src/components/ui/button.tsx")).toBe(false);
    expect(chakra.get("apps/hub/src/ui.tsx")).toContain('from "@internal/ui"');
    expect(chakra.get("apps/admin/src/client/ui.tsx")).toContain(
      "<Checkbox.Root",
    );
    // The screens, the theme and the pages' entry points are the no-kit ones.
    for (const path of [
      "apps/hub/src/forms.tsx",
      "apps/hub/src/main.tsx",
      "apps/admin/src/client/Admin.tsx",
      "apps/admin/src/client/main.tsx",
      "packages/theme/theme.css",
    ]) {
      expect(chakra.get(path)).toBe(plain.get(path));
    }
    // The example app draws with Chakra, inside the kit's provider.
    expect(chakra.get("apps/example/src/routes/__root.tsx")).toContain(
      "<Provider>{children}</Provider>",
    );
    expect(chakra.get("apps/example/src/routes/index.tsx")).toContain(
      'from "@internal/ui"',
    );
  });

  it.each<[string, Choices]>([
    ["the default", defaultChoices],
    ["no tools", { ...defaultChoices, tools: [] }],
    [
      "Prisma on Radix",
      { ...defaultChoices, orm: "prisma", uiKit: "shadcn-radix" },
    ],
    [
      "Kysely on Base UI",
      { ...defaultChoices, orm: "kysely", uiKit: "shadcn-base-ui" },
    ],
    ["Chakra with Hono first", { ...honoFirst, uiKit: "chakra" }],
  ])("keeps every file of %s pnpm install", async (_, choices) => {
    const files = await generateInstall(choices);

    // A digest per file: any change to a pnpm install's output fails here.
    expect(
      Object.fromEntries(
        [...files].map(([path, text]) => [
          path,
          createHash("sha256").update(text).digest("hex").slice(0, 16),
        ]),
      ),
    ).toMatchSnapshot();
  });

  describe("for bun", () => {
    const bunChoices: Choices = {
      ...defaultChoices,
      packageManager: "bun",
      orm: "prisma",
    };

    it("keeps its workspaces, catalog and trusted scripts in package.json", async () => {
      const files = await generateInstall(bunChoices);
      const manifest = json(files, "package.json") as {
        packageManager: string;
        workspaces: { packages: string[]; catalog: Record<string, string> };
        trustedDependencies: string[];
        overrides?: object;
      };

      expect(files.has("pnpm-workspace.yaml")).toBe(false);
      expect(manifest.packageManager).toBe("bun@1.4.4");
      expect(manifest.workspaces.packages).toEqual([
        "apps/*",
        "packages/*",
        "tooling/*",
      ]);
      expect(manifest.workspaces.catalog).toMatchObject({
        "@robkit/core": "0.0.0",
        "@prisma/client": "7.10.1",
        turbo: "2.11.10",
      });
      // Only the scripts the install must run: esbuild's is skipped.
      expect(manifest.trustedDependencies).toEqual(["@prisma/engines"]);
      expect(manifest.overrides).toBeUndefined();
      expect(files.get("bunfig.toml")).toContain("minimumReleaseAge = 86400");
    });

    it("links the @robkit packages to this checkout when asked", async () => {
      const files = await generateInstall(bunChoices, { link: true });
      const { overrides } = json(files, "package.json") as {
        overrides: Record<string, string>;
      };
      const checkout = fileURLToPath(new URL("../../../", import.meta.url));

      expect(overrides["@robkit/core"]).toBe(
        `link:${checkout.replaceAll("\\", "/")}packages/core`,
      );
      expect(Object.keys(overrides)).toHaveLength(8);
    });

    it("names bun's commands and files, never pnpm's", async () => {
      const files = await generateInstall({
        ...bunChoices,
        uiKit: "shadcn-base-ui",
      });

      const mentions = [...files].filter(([, text]) => text.includes("pnpm"));

      expect(mentions.map(([path]) => path)).toEqual([]);
      expect(files.get("AGENTS.md")).toContain(
        "bun run dev                  # Postgres, core, the hub",
      );
      expect(files.get("AGENTS.md")).toContain("`bun run lint` runs it");
      expect(files.get("packages/ui/AGENTS.md")).toContain(
        "bunx shadcn add <component>",
      );
      expect(files.get("packages/ui/AGENTS.md")).toContain(
        "under `workspaces.catalog` in `package.json`",
      );
      expect(files.get(".prettierignore")).toContain("bun.lock");
    });

    it("writes a CI workflow that runs the install's scripts with bun", async () => {
      const files = await generateInstall(bunChoices);
      const workflow = parse(files.get(".github/workflows/ci.yml") ?? "") as {
        jobs: Record<string, { steps: { run?: string }[] }>;
      };

      expect(
        workflow.jobs.check?.steps.flatMap((step) => step.run ?? []),
      ).toEqual([
        "bun install --frozen-lockfile",
        "bun run lint",
        "bun run --if-present format:check",
        "bun run typecheck",
        "bun run test",
        "bun run build",
      ]);
      expect(
        workflow.jobs.deploy?.steps.flatMap((step) => step.run ?? []),
      ).toContain("bun run robkit deploy");
    });
  });

  describe("for yarn", () => {
    const yarnChoices: Choices = {
      ...defaultChoices,
      packageManager: "yarn",
      orm: "prisma",
    };

    it("keeps its catalog in .yarnrc.yml, and its workspaces, builds and resolutions in package.json", async () => {
      const files = await generateInstall(yarnChoices);
      const manifest = json(files, "package.json") as {
        packageManager: string;
        workspaces: string[];
        dependenciesMeta: Record<string, { built: boolean }>;
        resolutions?: object;
      };
      const settings = parse(files.get(".yarnrc.yml") ?? "") as {
        nodeLinker: string;
        enableScripts: boolean;
        npmMinimalAgeGate: string;
        catalog: Record<string, string>;
      };

      expect(files.has("pnpm-workspace.yaml")).toBe(false);
      expect(manifest.packageManager).toBe("yarn@4.18.1");
      expect(manifest.workspaces).toEqual([
        "apps/*",
        "packages/*",
        "tooling/*",
      ]);
      expect(settings.nodeLinker).toBe("node-modules");
      expect(settings.npmMinimalAgeGate).toBe("1d");
      expect(settings.catalog).toMatchObject({
        "@robkit/core": "0.0.0",
        "@prisma/client": "7.10.1",
        turbo: "2.11.10",
      });
      // Only the scripts dependenciesMeta allows run.
      expect(settings.enableScripts).toBe(false);
      expect(manifest.dependenciesMeta).toEqual({
        "@prisma/engines": { built: true },
        prisma: { built: false },
      });
      expect(manifest.resolutions).toBeUndefined();
    });

    it("links the @robkit packages to this checkout with portals, and catalogs what they depend on", async () => {
      const files = await generateInstall(yarnChoices, { link: true });
      const { resolutions } = json(files, "package.json") as {
        resolutions: Record<string, string>;
      };
      const { catalog } = parse(files.get(".yarnrc.yml") ?? "") as {
        catalog: Record<string, string>;
      };
      const checkout = fileURLToPath(new URL("../../../", import.meta.url));

      // yarn links no bins from a link: package, and an install runs
      // robkit-dev and robkit. A portal installs the package's own
      // dependencies, as a package from npm does.
      expect(resolutions["@robkit/core"]).toBe(
        `portal:${checkout.replaceAll("\\", "/")}packages/core`,
      );
      expect(Object.keys(resolutions)).toHaveLength(8);
      // Core's ORM, which this Prisma install's apps don't use.
      expect(catalog["drizzle-orm"]).toBeDefined();
    });

    it("catalogs only what its apps use when not linked", async () => {
      const files = await generateInstall(yarnChoices);
      const { catalog } = parse(files.get(".yarnrc.yml") ?? "") as {
        catalog: Record<string, string>;
      };

      expect(catalog["drizzle-orm"]).toBeUndefined();
    });

    it("names yarn's commands and files, never pnpm's", async () => {
      const files = await generateInstall({
        ...yarnChoices,
        uiKit: "shadcn-base-ui",
      });

      const mentions = [...files].filter(([, text]) => text.includes("pnpm"));

      expect(mentions.map(([path]) => path)).toEqual([]);
      expect(files.get("AGENTS.md")).toContain(
        "yarn run dev                 # Postgres, core, the hub",
      );
      expect(files.get("AGENTS.md")).toContain("`yarn run lint` runs it");
      expect(files.get("packages/ui/AGENTS.md")).toContain(
        "yarn shadcn add <component>",
      );
      expect(files.get("packages/ui/AGENTS.md")).toContain(
        "under `catalog:` in `.yarnrc.yml`",
      );
      expect(files.get(".prettierignore")).toContain("yarn.lock");
    });

    it("writes a CI workflow that installs yarn with npm and runs the install's scripts with it", async () => {
      const files = await generateInstall(yarnChoices);
      const workflow = parse(files.get(".github/workflows/ci.yml") ?? "") as {
        jobs: Record<string, { steps: { run?: string }[] }>;
      };
      const runs = (job: string) =>
        workflow.jobs[job]?.steps.flatMap((step) => step.run?.trim() ?? []);

      expect(runs("check")).toEqual([
        expect.stringMatching(/^npm install --global --force .*cli-dist/),
        "yarn install --immutable",
        "yarn run lint",
        expect.stringContaining("yarn run format:check"),
        "yarn run typecheck",
        "yarn run test",
        "yarn run build",
      ]);
      expect(runs("deploy")).toContain("yarn run robkit deploy");
    });
  });

  it.each([
    ["pnpm", "pnpm install --frozen-lockfile"],
    ["bun", "bun install --frozen-lockfile"],
    ["yarn", "yarn install --immutable"],
  ] as const)(
    "builds %s's images without Corepack, from a pruned frozen install",
    async (packageManager, frozenInstall) => {
      const files = await generateInstall({
        ...defaultChoices,
        packageManager,
      });
      const dockerfile = files.get("Dockerfile") ?? "";

      expect(dockerfile.toLowerCase()).not.toMatch(/^run .*corepack/m);
      expect(dockerfile).toContain("turbo prune");
      expect(dockerfile).toContain(frozenInstall);
    },
  );

  it("gives the example app its stack's agent files", async () => {
    const files = await generateInstall(defaultChoices);
    const template = await stackTemplate("start", "drizzle");

    expect(files.get("apps/example/AGENTS.md")).toBe(template.get("AGENTS.md"));
    expect(files.get("apps/example/CLAUDE.md")).toBe("@AGENTS.md\n");
  });
});
