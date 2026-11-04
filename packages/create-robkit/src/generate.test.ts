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

  it("gives the example app its stack's agent files", async () => {
    const files = await generateInstall(defaultChoices);
    const template = await stackTemplate("start", "drizzle");

    expect(files.get("apps/example/AGENTS.md")).toBe(template.get("AGENTS.md"));
    expect(files.get("apps/example/CLAUDE.md")).toBe("@AGENTS.md\n");
  });
});
