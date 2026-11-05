import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addApp, type AppChoices } from "./add.ts";
import { defaultChoices, type Choices } from "./choices.ts";
import { init } from "./init.ts";

async function freshInstall(choices: Choices = defaultChoices) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(choices, dir);
  return dir;
}

async function manifest(dir: string, slug: string): Promise<unknown> {
  return JSON.parse(
    await readFile(join(dir, "apps", slug, "package.json"), "utf8"),
  );
}

const notes: AppChoices = {
  stack: "react-hono",
  slug: "notes",
  access: { kind: "open" },
  icon: "📝",
};

describe("addApp", () => {
  it("writes apps/<slug> from the stack's template, declaring its rule and icon", async () => {
    const dir = await freshInstall();

    await addApp(dir, notes);

    expect(await manifest(dir, "notes")).toMatchObject({
      name: "@internal/notes-app",
      scripts: { migrate: "node src/migrate.ts" },
      dependencies: { "@robkit/hono": "catalog:" },
      robkit: { access: { kind: "open" }, icon: "📝" },
    });
    expect(await readFile(join(dir, "apps/notes/src/server.tsx"), "utf8")).toBe(
      await readFile(
        new URL(
          "../templates/ui-kits/shadcn/app/react-hono/src/server.tsx",
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

  it("names a rule's roles, as core finds them", async () => {
    const dir = await freshInstall();

    await addApp(dir, {
      ...notes,
      access: { kind: "roles", roles: ["Family", "Cooks"] },
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

  it("offers only the stacks robkit.json enables", async () => {
    const dir = await freshInstall({
      ...defaultChoices,
      generators: ["start"],
    });

    await expect(addApp(dir, notes)).rejects.toThrow(
      "This install's robkit add offers start, not react-hono.",
    );
  });

  it.each([
    [
      "my-notes",
      `"my-notes" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    ["hub", "hub is one of the platform apps: core, hub and admin."],
    ["example", "apps/example already exists. Choose another name."],
  ])("refuses the name %j", async (slug, message) => {
    const dir = await freshInstall();

    await expect(addApp(dir, { ...notes, slug })).rejects.toThrow(message);
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
      await readFile(join(dir, "apps/notes/src/server.tsx"), "utf8"),
    ).toContain('from "@internal/ui/components/ui/card"');
  });

  it("refuses a folder that isn't an install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));

    await expect(addApp(dir, notes)).rejects.toThrow(
      `${dir} has no robkit.json. Run robkit add in an install's folder.`,
    );
  });
});
