import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { defaultChoices, readyStacks, type Choices } from "./choices.ts";
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

const honoExample: Choices = { exampleStack: "react-hono" };

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

  it("records the example's stack in robkit.json", async () => {
    const files = await generateInstall(honoExample);

    expect(JSON.parse(files.get("robkit.json") ?? "")).toEqual({
      exampleStack: "react-hono",
    });
  });

  it("adds the example app on the stack asked for", async () => {
    const start = await generateInstall(defaultChoices);
    const hono = await generateInstall(honoExample);

    expect(start.has("apps/example/src/routes/index.tsx")).toBe(true);
    expect(start.has("apps/example/src/server.tsx")).toBe(false);
    expect(hono.has("apps/example/src/server.tsx")).toBe(true);
    expect(hono.has("apps/example/src/routes/index.tsx")).toBe(false);
    expect(json(hono, "apps/example/package.json")).toMatchObject({
      name: "@internal/example-app",
      dependencies: { "@robkit/hono": "catalog:" },
    });
  });

  it("gives the example app a manifest, with the icon robkit add gives an app by default", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "apps/example/package.json")).toMatchObject({
      robkit: { name: "example", stack: "start", contract: 1, icon: "📦" },
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
        format: "prettier --ignore-path .prettierignore --write .",
        "format:check": "prettier --ignore-path .prettierignore --check .",
        robkit: "robkit",
        postinstall: "husky || true",
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
        husky: "catalog:",
        "lint-staged": "catalog:",
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
      "pnpm robkit install",
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
      "pnpm robkit install",
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

  it("has turbo hash every file of an app, though the install's git ignores app repos", async () => {
    const files = await generateInstall(defaultChoices);
    const { tasks } = json(files, "turbo.json") as {
      tasks: Record<string, { inputs?: string[] }>;
    };

    // turbo's default inputs are the files git tracks, which would cache
    // an app repo's checks for ever.
    for (const task of ["build", "typecheck", "test"]) {
      expect(tasks[task]?.inputs).toEqual([
        "**",
        "!node_modules/**",
        "!.git/**",
        "!.turbo/**",
        "!dist/**",
      ]);
    }
  });

  it("lints with robkit check, then ESLint", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "package.json")).toMatchObject({
      scripts: { lint: "robkit check && eslint ." },
    });
  });

  it("tells the root AGENTS.md about each dev tool", async () => {
    const files = await generateInstall(defaultChoices);
    const agents = files.get("AGENTS.md") ?? "";

    expect(agents).toContain("\n## Dev tools\n\n");
    for (const tool of ["ESLint and Prettier", "Vitest", "Husky"]) {
      expect(agents, tool).toContain(`- **${tool}`);
    }
  });

  describe("with Husky", () => {
    it("sets up a pre-commit hook that runs lint-staged as the install installs", async () => {
      const files = await generateInstall(defaultChoices);

      expect(files.get(".husky/pre-commit")).toBe("pnpm exec lint-staged\n");
      expect(json(files, "package.json")).toMatchObject({
        scripts: { postinstall: "husky || true" },
        devDependencies: { husky: "catalog:", "lint-staged": "catalog:" },
      });
      expect(workspace(files).catalog).toMatchObject({
        husky: "9.1.7",
        "lint-staged": "17.6.0",
      });
    });

    it("checks the layer rule before each commit, and ESLint and Prettier the staged files", async () => {
      const files = await generateInstall(defaultChoices);
      const config = files.get("lint-staged.config.js");

      expect(config).toContain('() => "robkit check"');
      expect(config).toContain("eslint --fix");
      expect(config).toContain("prettier --write");
    });
  });

  it("writes each test beside the code it covers, run by Vitest", async () => {
    const files = await generateInstall(defaultChoices);
    const isTestFile = (path: string) =>
      /\.test\.tsx?$|(^|\/)vitest\.config\.ts$/.test(path);

    expect([...files.keys()].filter(isTestFile)).toEqual(
      expect.arrayContaining([
        "apps/admin/vitest.config.ts",
        "apps/hub/src/core-api.test.ts",
        "packages/core-client/src/call-core.test.ts",
      ]),
    );
    expect(json(files, "apps/hub/package.json")).toMatchObject({
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "catalog:" },
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
    const { catalog } = workspace(await generateInstall(honoExample));

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

  it("has a template folder for every stack robkit can make", async () => {
    for (const stack of readyStacks) {
      const dir = new URL(`../templates/stacks/${stack}/`, import.meta.url);
      expect((await stat(dir)).isDirectory(), stack).toBe(true);
    }
  });

  it.each([
    ["start", "context.viewer"],
    ["react-hono", "c.var.viewer"],
  ] as const)(
    "gives a %s app an AGENTS.md for its stack and Drizzle, which CLAUDE.md points at",
    async (stack, viewer) => {
      const files = await stackTemplate(stack);
      const agents = files.get("AGENTS.md") ?? "";

      // How to read the viewer, call core and add a migration.
      expect(agents).toContain(`read who is asking as \`${viewer}\``);
      expect(agents).toContain(
        "over HTTP from the server at `process.env.ROBKIT_CORE_URL`",
      );
      expect(agents).toContain("`src/migrate.ts` applies the migrations");
      expect(agents).toContain("## The database");
      expect(files.get("CLAUDE.md")).toBe("@AGENTS.md\n");
    },
  );

  it.each(["start", "react-hono"] as const)(
    "lays Drizzle's app files over a %s app",
    async (stack) => {
      const files = await stackTemplate(stack);
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

  it("gives every install packages/ui, and draws the hub and admin with it", async () => {
    const kit = await generateInstall(defaultChoices);
    // Vite bundles the kit into the hub, so it is a build-time package.
    const hub = json(kit, "apps/hub/package.json") as {
      devDependencies: Record<string, string>;
    };
    const { catalog } = workspace(kit);

    expect(kit.has("packages/ui/src/components/ui/button.tsx")).toBe(true);
    // Only the install: each stack's files stay out of it.
    expect(
      [...kit.keys()].filter(
        (path) =>
          !/^(?:apps|packages|tooling|docs|robkit|\.github|\.husky)\/|^[^/]+$/.test(
            path,
          ),
      ),
    ).toEqual([]);
    expect(kit.get("apps/hub/src/ui.tsx")).toContain(
      'from "@internal/ui/components/ui/button"',
    );
    expect(kit.get("apps/admin/src/client/ui.tsx")).toContain(
      'from "@internal/ui/components/ui/checkbox"',
    );
    expect(hub.devDependencies["@internal/ui"]).toBe("workspace:*");
    expect(kit.get("apps/example/src/styles.css")).toContain(
      "@internal/ui/styles.css",
    );
    expect(catalog).toMatchObject({
      "@base-ui/react": "1.9.0",
      shadcn: "4.23.0",
    });
  });

  it.each<[string, Choices]>([
    ["the default", defaultChoices],
    ["the Hono example", honoExample],
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

  it("names the install's Compose project as asked, and leaves it to Compose otherwise", async () => {
    const named = await generateInstall(defaultChoices, {
      project: "my-app-0a1b2c",
    });
    const unnamed = await generateInstall(defaultChoices);

    const compose = (files: Files) =>
      parse(files.get("compose.yaml") ?? "") as {
        name?: string;
        services: Record<string, unknown>;
      };
    expect(compose(named).name).toBe("my-app-0a1b2c");
    expect(compose(named).services).toEqual(compose(unnamed).services);
    expect(compose(unnamed).name).toBeUndefined();
  });

  it("builds images without Corepack, from a pruned frozen install", async () => {
    const files = await generateInstall(defaultChoices);
    const dockerfile = files.get("Dockerfile") ?? "";

    expect(dockerfile.toLowerCase()).not.toMatch(/^run .*corepack/m);
    expect(dockerfile).toContain("turbo prune");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
  });

  it("gives the example app its stack's agent files", async () => {
    const files = await generateInstall(defaultChoices);
    const template = await stackTemplate("start");

    expect(files.get("apps/example/AGENTS.md")).toBe(template.get("AGENTS.md"));
    expect(files.get("apps/example/CLAUDE.md")).toBe("@AGENTS.md\n");
  });
});
