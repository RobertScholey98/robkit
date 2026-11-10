import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addApp, readNewSlug, type AppChoices } from "./add.ts";
import { defaultChoices, readyStacks, type Choices } from "./choices.ts";
import { init } from "./init.ts";
import { slug } from "@internal/test-session";

async function freshInstall(choices: Choices = defaultChoices) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(choices, dir, { install: false });
  return dir;
}

let readOnly: Promise<string> | undefined;

/** One fresh install, made on first use, for the tests that only read it. */
function readOnlyInstall(): Promise<string> {
  readOnly ??= freshInstall();
  return readOnly;
}

async function manifest(dir: string, slug: string): Promise<unknown> {
  return JSON.parse(
    await readFile(join(dir, "apps", slug, "package.json"), "utf8"),
  );
}

const notes: AppChoices = {
  stack: "react-hono",
  slug: slug("notes"),
  access: { kind: "open" },
  icon: "📝",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("addApp", () => {
  it("builds the app in .robkit/, which git ignores, and moves it into apps/", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await readdir(join(dir, "apps/notes"))).toContain("package.json");
    expect(await readdir(join(dir, ".robkit"))).toEqual([]);
    expect(
      (await readFile(join(dir, ".gitignore"), "utf8")).split("\n"),
    ).toContain(".robkit/");
  });

  it("writes apps/<slug> from the stack's template, declaring its rule and icon", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await manifest(dir, "notes")).toMatchObject({
      name: "@internal/notes-app",
      scripts: { migrate: "robkit-migrate" },
      dependencies: { "@robkit/hono": "catalog:" },
      robkit: { access: { kind: "open" }, icon: "📝" },
    });
    expect(await readFile(join(dir, "apps/notes/src/server.tsx"), "utf8")).toBe(
      await readFile(
        new URL(
          "../templates/stacks/react-hono/src/server.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(await readFile(join(dir, "apps/notes/AGENTS.md"), "utf8")).toContain(
      "A React app on a Hono server in a robkit install.",
    );
    expect(await readFile(join(dir, "apps/notes/CLAUDE.md"), "utf8")).toBe(
      "@AGENTS.md\n",
    );
  });

  it("points a Go app at the checkout's Go module in a linked install, and at vendor/robkit/go in any other", async () => {
    const linked = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, linked, { link: true, install: false });
    const plain = await freshInstall();
    const checkout = fileURLToPath(
      new URL("../../../", import.meta.url),
    ).replaceAll("\\", "/");
    const replaceIn = async (dir: string) =>
      (await readFile(join(dir, "apps/notes/go.mod"), "utf8"))
        .split("\n")
        .filter((line) => line.startsWith("replace "));

    await addApp(linked, { ...notes, stack: "go" });
    await addApp(plain, { ...notes, stack: "go" });

    expect(await replaceIn(linked)).toEqual([
      `replace github.com/RobertScholey98/robkit/go => ${checkout}go`,
    ]);
    expect(await replaceIn(plain)).toEqual([
      "replace github.com/RobertScholey98/robkit/go => ../../vendor/robkit/go",
    ]);
  });

  it("writes robkit's Go module to vendor/robkit/go with the first Go app of an install that had none", async () => {
    const dir = await freshInstall();
    const guarded = join(dir, "vendor/robkit/go/session/guarded.go");
    const hadModule = await readFile(guarded, "utf8").then(
      () => true,
      () => false,
    );

    await addApp(dir, { ...notes, stack: "go" });

    expect(hadModule).toBe(false);
    expect(await readFile(guarded, "utf8")).toBe(
      (
        await readFile(
          new URL("../../../go/session/guarded.go", import.meta.url),
          "utf8",
        )
      ).replaceAll("\r\n", "\n"),
    );
    // Its tests stay in robkit.
    expect(
      (await readdir(join(dir, "vendor/robkit/go/session"))).filter((name) =>
        name.endsWith("_test.go"),
      ),
    ).toEqual([]);
  });

  it("leaves vendor/robkit/go alone in a linked install, whose Go apps reach the checkout", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, dir, { link: true, install: false });

    await addApp(dir, { ...notes, stack: "go" });

    expect(await readdir(dir)).not.toContain("vendor");
  });

  // It empties PATH for the whole process, so it runs alone rather than
  // beside a test that adds a Go app.
  it(
    "says how to install Go, writing nothing, for a React + Go app when go isn't on the PATH",
    { concurrent: false },
    async () => {
      const dir = await freshInstall();
      vi.stubEnv("PATH", await mkdtemp(join(tmpdir(), "no-go-")));

      await expect(addApp(dir, { ...notes, stack: "go" })).rejects.toThrow(
        "Go isn't installed, or isn't on your PATH",
      );
      expect(await readdir(join(dir, "apps"))).not.toContain("notes");
    },
  );

  it("names a rule's roles, as core finds them", async () => {
    const dir = await freshInstall();

    await addApp(dir, {
      ...notes,
      access: { kind: "roles", roleNames: ["Family", "Cooks"] },
    });

    expect(await manifest(dir, "notes")).toMatchObject({
      robkit: { access: { kind: "roles", roles: ["Family", "Cooks"] } },
    });
  });

  it("takes the stack's template from robkit/templates/<stack> when the install has one", async () => {
    const dir = await freshInstall();
    const override = join(dir, "robkit/templates/start");
    await mkdir(join(override, "src"), { recursive: true });
    await writeFile(
      join(override, "package.json"),
      JSON.stringify({ private: true, scripts: { dev: "vite dev" } }),
    );
    await writeFile(join(override, "src/main.ts"), "// my own\n");

    await addApp(dir, { ...notes, stack: "start" });

    expect(await readdir(join(dir, "apps/notes"), { recursive: true })).toEqual(
      expect.arrayContaining(["package.json", join("src", "main.ts")]),
    );
    expect(await readdir(join(dir, "apps/notes/src"))).toEqual(["main.ts"]);
    expect(await manifest(dir, "notes")).toEqual({
      name: "@internal/notes-app",
      private: true,
      scripts: { dev: "vite dev" },
      robkit: { access: { kind: "open" }, icon: "📝" },
    });
  });

  it.each(readyStacks)(
    "adds an app on %s, whatever the example's",
    async (stack) => {
      const dir = await freshInstall();
      const template: unknown = JSON.parse(
        await readFile(
          new URL(`../templates/stacks/${stack}/package.json`, import.meta.url),
          "utf8",
        ),
      );
      const app = slug(`on${stack.replaceAll("-", "")}`);

      await addApp(dir, { ...notes, slug: app, stack });

      expect(await manifest(dir, app)).toEqual({
        name: `@internal/${app}-app`,
        ...(template as object),
        robkit: { access: { kind: "open" }, icon: "📝" },
      });
    },
  );

  it.each([
    [
      "my-notes",
      `"my-notes" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    // Not a slug, so it never reaches an address: origin would make it
    // http://bad.
    [
      "bad/path",
      `"bad/path" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    ["hub", "hub is one of the platform apps: core, hub and admin."],
    ["example", "apps/example already exists. Choose another name."],
  ])("refuses the name %j", async (name, message) => {
    const dir = await readOnlyInstall();

    expect(readNewSlug(dir, name)).toEqual({ error: message });
  });

  it("refuses to write over an app", async () => {
    const dir = await readOnlyInstall();

    await expect(
      addApp(dir, { ...notes, slug: slug("example") }),
    ).rejects.toThrow("apps/example already exists. Choose another name.");
  });

  it("draws the app with the install's UI kit", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await manifest(dir, "notes")).toMatchObject({
      dependencies: { "@internal/ui": "workspace:*" },
    });
    expect(
      await readFile(join(dir, "apps/notes/src/styles.css"), "utf8"),
    ).toContain('@import "@internal/ui/styles.css";');
    expect(
      await readFile(join(dir, "apps/notes/src/routes.tsx"), "utf8"),
    ).toContain('from "@internal/ui/components/ui/card"');
  });

  it("refuses an install whose robkit.json isn't JSON, naming it", async () => {
    const dir = await freshInstall();
    await writeFile(join(dir, "robkit.json"), "{ nope");

    await expect(addApp(dir, notes)).rejects.toThrow(
      /^robkit\.json isn't valid JSON \(.+\)\. Fix its syntax\.$/,
    );
  });

  it("refuses an install whose robkit.json has the wrong shape", async () => {
    const dir = await freshInstall();
    await writeFile(join(dir, "robkit.json"), "null");

    await expect(addApp(dir, notes)).rejects.toThrow(
      "robkit.json must be a JSON object",
    );
  });

  it("refuses a folder that isn't an install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));

    await expect(addApp(dir, notes)).rejects.toThrow(
      `${dir} has no robkit.json. Run robkit add in an install's folder.`,
    );
  });
});
