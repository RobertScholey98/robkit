import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  defaultChoices,
  readyStackOptions,
  readyStacks,
  type Choices,
  type Stack,
} from "./choices.ts";
import { layerRule } from "./check.ts";
import {
  generateInstall,
  readFolder,
  stackTemplate,
  type Files,
} from "./generate.ts";

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

/** The files the generator writes itself, rather than copying from a template. */
const rendered = [
  "apps/example/package.json",
  "package.json",
  "pnpm-workspace.yaml",
  "robkit.json",
];

/** Where an install keeps the copy of robkit's lint policy. */
const lintPolicyDir = "tooling/eslint/";

describe("generateInstall", () => {
  it.each<[string, Choices]>([
    ["the default", defaultChoices],
    ["the Hono example", honoExample],
  ])(
    "copies every file of the base and the example's stack whole into %s install",
    async (_, choices) => {
      const files = await generateInstall(choices);
      const base = await readFolder(
        fileURLToPath(new URL("../templates/base/", import.meta.url)),
      );
      const stack = await stackTemplate(choices.exampleStack);
      const templates: Files = new Map([
        ...base,
        ...[...stack].map(
          ([path, text]) => [`apps/example/${path}`, text] as const,
        ),
      ]);

      // Every file is a template's, one the generator writes, or robkit's
      // lint policy, which the next test checks.
      const policy = [...files.keys()].filter((path) =>
        path.startsWith(lintPolicyDir),
      );
      expect([...files.keys()].sort()).toEqual(
        [...new Set([...templates.keys(), ...rendered, ...policy])].sort(),
      );
      for (const [path, text] of templates) {
        if (!rendered.includes(path)) expect(files.get(path), path).toBe(text);
      }
    },
  );

  it("copies robkit's lint policy whole: policy.js and what it imports, nothing else", async () => {
    const files = await generateInstall(defaultChoices);
    const policy = new Map(
      [...files]
        .filter(([path]) => path.startsWith(lintPolicyDir))
        .map(([path, text]) => [path.slice(lintPolicyDir.length), text]),
    );
    const imported = new Set(
      [...policy.values()].flatMap((text) =>
        [...text.matchAll(/from "\.\/([\w.-]+\.js)"/g)].flatMap(([, name]) =>
          name === undefined ? [] : [name],
        ),
      ),
    );

    expect(policy.has("policy.js")).toBe(true);
    // Nothing a copied file imports is missing, and nothing else is copied.
    expect([...imported].filter((name) => !policy.has(name))).toEqual([]);
    expect(
      [...policy.keys()].filter(
        (name) => name !== "policy.js" && !imported.has(name),
      ),
    ).toEqual([]);
    for (const [name, text] of policy) {
      const robkits = await readFile(
        new URL(`../../../tooling/eslint/${name}`, import.meta.url),
        "utf8",
      );
      expect(text, name).toBe(robkits.replaceAll("\r\n", "\n"));
    }
  });

  it("records the example's stack in robkit.json", async () => {
    const start = await generateInstall(defaultChoices);
    const hono = await generateInstall(honoExample);

    expect(start.get("robkit.json")).toBe('{ "exampleStack": "start" }\n');
    expect(hono.get("robkit.json")).toBe('{ "exampleStack": "react-hono" }\n');
  });

  it("names robkit's own pnpm in the root package.json", async () => {
    const files = await generateInstall(defaultChoices);
    const robkit = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { packageManager: string };

    expect(json(files, "package.json")).toMatchObject({
      packageManager: robkit.packageManager,
    });
  });

  it("keeps pnpm's settings from the template, adding the catalog", async () => {
    const files = await generateInstall(defaultChoices);
    const settings = parse(files.get("pnpm-workspace.yaml") ?? "") as Record<
      string,
      unknown
    >;

    expect(Object.keys(settings)).toEqual([
      "packages",
      "catalogMode",
      "allowBuilds",
      "overrides",
      "catalog",
    ]);
    expect(settings).toMatchObject({
      packages: ["apps/*", "packages/*", "tooling/*"],
      catalogMode: "strict",
      allowBuilds: { esbuild: false },
      overrides: { "styled-jsx>@babel/core": "-" },
    });
  });

  it("catalogs every dependency a manifest takes from the catalog", async () => {
    const files = await generateInstall(defaultChoices);
    const { catalog } = workspace(files);
    const fromCatalog = [...files]
      .filter(([path]) => path.endsWith("package.json"))
      .flatMap(([, text]) => {
        const manifest = JSON.parse(text) as Record<
          string,
          Record<string, string> | undefined
        >;
        return [manifest.dependencies, manifest.devDependencies].flatMap(
          (deps) =>
            Object.entries(deps ?? {}).flatMap(([name, spec]) =>
              spec === "catalog:" ? [name] : [],
            ),
        );
      });

    expect(fromCatalog.filter((name) => !(name in catalog))).toEqual([]);
  });

  it("names the example app's manifest after it, keeping its stack's", async () => {
    const files = await generateInstall(defaultChoices);
    const stack = await stackTemplate("start");

    expect(json(files, "apps/example/package.json")).toEqual({
      name: "@internal/example-app",
      ...(JSON.parse(stack.get("package.json") ?? "") as object),
      robkit: { icon: "📦" },
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

  it("gives the example app the icon robkit add gives an app by default", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "apps/example/package.json")).toMatchObject({
      robkit: { icon: "📦" },
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

  it("lints with robkit check, then ESLint, then each app's own lint, such as gofmt", async () => {
    const files = await generateInstall(defaultChoices);

    expect(json(files, "package.json")).toMatchObject({
      scripts: { lint: "robkit check && eslint . && turbo run lint" },
    });
    expect(json(files, "turbo.json")).toMatchObject({
      tasks: { lint: {} },
    });
  });

  /** The Go release a step or stage of the install sets up. */
  const goVersionIn = (text: string, pattern: RegExp) =>
    pattern.exec(text)?.[1];

  it("sets up Go in its CI's checks only when an app has a go.mod, at the release its images build with", async () => {
    const files = await generateInstall(defaultChoices);
    const workflow = parse(files.get(".github/workflows/ci.yml") ?? "") as {
      jobs: Record<
        string,
        {
          steps: {
            if?: string;
            uses?: string;
            with?: Record<string, string>;
          }[];
        }
      >;
    };

    const setUpGo = workflow.jobs.check?.steps.find((step) =>
      step.uses?.startsWith("actions/setup-go@"),
    );

    expect(setUpGo).toEqual({
      if: "hashFiles('apps/*/go.mod') != ''",
      uses: "actions/setup-go@v7",
      with: {
        "go-version": goVersionIn(
          files.get("Dockerfile") ?? "",
          /go\.dev\/dl\/go([\d.]+)\.linux/,
        ),
        "cache-dependency-path": "apps/*/go.sum",
      },
    });
  });

  it("builds a Go app's server in its image, fetching Go only for an app with a go.mod", async () => {
    const files = await generateInstall(defaultChoices);
    const dockerfile = files.get("Dockerfile") ?? "";

    expect(dockerfile).toContain("FROM node:24-alpine AS go");
    expect(dockerfile).toMatch(/if \[ -f [^\]]*go\.mod \]; then/);
    expect(dockerfile).toContain("sha256sum -c -");
    expect(dockerfile).toContain("COPY --from=go /usr/local/go /usr/local/go");
    // The runtime is the same for every app: Node runs the start script.
    expect(dockerfile).toMatch(/\nCMD \["node", "--run", "start"\]\n$/);
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
      expect(config).toContain('"*.go": "gofmt -w"');
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
    // Only the one that keeps Babel out of a Next.js app's image.
    expect(overrides).toEqual({ "styled-jsx>@babel/core": "-" });
  });

  it("catalogs every stack robkit add offers, not only the example's", async () => {
    const { catalog } = workspace(await generateInstall(honoExample));

    expect(catalog).toMatchObject({
      "@robkit/express": "0.0.0",
      "@robkit/next": "0.0.0",
      "@robkit/start": "0.0.0",
      "@tailwindcss/postcss": "4.3.3",
      "@tanstack/react-start": "1.169.4",
      "@types/express": "5.0.6",
      express: "5.3.0",
      next: "16.4.5",
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
      "@robkit/express": at("express"),
      "@robkit/guard": at("guard"),
      "@robkit/hono": at("hono"),
      "@robkit/input": at("input"),
      "@robkit/next": at("next"),
      // No manifest names it: it arrives behind @robkit/core.
      "@robkit/provision": at("provision"),
      "@robkit/react": at("react"),
      "@robkit/session": at("session"),
      "@robkit/start": at("start"),
      "create-robkit": at("create-robkit"),
      "styled-jsx>@babel/core": "-",
    });
  });

  it("points a Go app's go.mod at robkit's Go module: the checkout's under --link, vendor/robkit/go otherwise", async () => {
    const goExample: Choices = { exampleStack: "go" };
    const checkout = fileURLToPath(
      new URL("../../../", import.meta.url),
    ).replaceAll("\\", "/");

    const linked = await generateInstall(goExample, { link: true });
    const plain = await generateInstall(goExample);

    expect(linked.get("apps/example/go.mod")).toContain(
      `\nreplace github.com/RobertScholey98/robkit/go => ${checkout}go\n`,
    );
    expect(plain.get("apps/example/go.mod")).toContain(
      "\nreplace github.com/RobertScholey98/robkit/go => ../../vendor/robkit/go\n",
    );
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

  /** How each stack's handlers read who is asking, and core's address. */
  const serverOn = {
    start: { viewer: "context.viewer", core: "process.env.ROBKIT_CORE_URL" },
    "react-hono": {
      viewer: "c.var.viewer",
      core: "process.env.ROBKIT_CORE_URL",
    },
    express: {
      viewer: "res.locals.viewer",
      core: "process.env.ROBKIT_CORE_URL",
    },
    next: { viewer: "await viewer()", core: "process.env.ROBKIT_CORE_URL" },
    go: {
      viewer: "session.ViewerFrom(r.Context())",
      core: 'os.Getenv("ROBKIT_CORE_URL")',
    },
  } satisfies Record<Stack, { viewer: string; core: string }>;

  /** The stacks whose apps take robkit's Drizzle files for their database. */
  const drizzleStacks = readyStackOptions
    .filter((stack) => !("ownsDatabase" in stack))
    .map((stack) => stack.value);

  it.each(readyStacks.map((stack) => [stack, serverOn[stack]] as const))(
    "gives a %s app an AGENTS.md for its stack and database, which CLAUDE.md points at",
    async (stack, { viewer, core }) => {
      const files = await stackTemplate(stack);
      const agents = files.get("AGENTS.md") ?? "";

      // How to read the viewer, call core and add a migration.
      expect(agents).toContain(`read who is asking as \`${viewer}\``);
      expect(agents).toContain(`over HTTP from the server at \`${core}\``);
      expect(agents).toContain("## The database");
      expect(files.get("CLAUDE.md")).toBe("@AGENTS.md\n");
    },
  );

  it.each(drizzleStacks)(
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
      expect(files.get("AGENTS.md")).toContain(
        "`src/migrate.ts` applies the migrations",
      );
    },
  );

  it("keeps Drizzle out of the Go app, which owns its migrations", async () => {
    const files = await stackTemplate("go");
    const manifest = JSON.parse(files.get("package.json") ?? "{}") as {
      devDependencies: Record<string, string>;
    };

    expect(drizzleStacks).not.toContain("go");
    expect([...files.keys()].filter((path) => /drizzle/i.test(path))).toEqual(
      [],
    );
    expect(manifest.devDependencies).not.toHaveProperty("drizzle-orm");
    expect(files.get("migrations/0001_init.sql")).toContain(
      "create table visit",
    );
    expect(files.get("migrate.go")).toContain("//go:embed migrations/*.sql");
    expect(files.get("go.mod")).toContain("github.com/jackc/pgx/v5");
  });

  it("maps a Go app's scripts to Go's tools, and runs nothing from node_modules in production", async () => {
    const files = await stackTemplate("go");
    const manifest = JSON.parse(files.get("package.json") ?? "{}") as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    expect(manifest.scripts).toEqual({
      dev: "go run . dev",
      typecheck: "go vet ./... && tsc",
      lint: "gofmt -d .",
      test: "go test ./...",
      build: "vite build && go build -o dist/server .",
      start: "./dist/server migrate && ./dist/server",
      migrate: "go run . migrate",
    });
    // The image installs only dependencies, and the binary needs none.
    expect(manifest.dependencies).toBeUndefined();
  });

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
          !/^(?:apps|packages|tooling|docs|\.github|\.husky)\/|^[^/]+$/.test(
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
