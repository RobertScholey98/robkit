import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
import { slug } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import { addCommandFor, appChoicesFromFlags, askAdd } from "./add-wizard.ts";
import { answering, cancel, type Answer } from "./test/fake-prompts.ts";

const questions = {
  stack: "Which stack?",
  name: "What's the app called?",
  access: "Who can open it?",
  roles: "Which roles? Separate them with commas.",
  icon: "Which emoji should the launcher show?",
};

/** An install's folder, holding apps/notes. */
async function installWithNotes(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-add-wizard-"));
  await mkdir(join(root, "apps", "notes"), { recursive: true });
  return root;
}

describe("askAdd", () => {
  it("asks for the stack, name, access and icon", async () => {
    const root = await installWithNotes();
    const { prompts, asked } = answering([
      "react-hono",
      "recipes",
      "open",
      "🍲",
    ]);

    expect(await askAdd(root, undefined, prompts)).toEqual({
      stack: "react-hono",
      slug: slug("recipes"),
      access: { kind: "open" },
      icon: "🍲",
    });
    expect(asked).toEqual([
      questions.stack,
      questions.name,
      questions.access,
      questions.icon,
    ]);
  });

  it.each(["start", "react-hono", "express", "next", "go"])(
    "offers %s, a stack robkit can make",
    async (stack) => {
      const root = await installWithNotes();
      const { prompts } = answering([stack, "recipes", "open", "🍲"]);

      expect(await askAdd(root, undefined, prompts)).toMatchObject({ stack });
    },
  );

  it("asks which roles may open an app for guests with certain roles", async () => {
    const root = await installWithNotes();
    const { prompts, asked, refused } = answering([
      "start",
      "recipes",
      "roles",
      " ",
      "Family, Cooks ,",
      "",
    ]);

    expect(await askAdd(root, undefined, prompts)).toMatchObject({
      access: { kind: "roles", roleNames: ["Family", "Cooks"] },
    });
    expect(asked).toEqual([
      questions.stack,
      questions.name,
      questions.access,
      questions.roles,
      questions.roles,
      questions.icon,
    ]);
    expect(refused).toEqual(["Name at least one role."]);
  });

  it("gives the app the default icon when none is typed", async () => {
    const root = await installWithNotes();
    const { prompts } = answering(["start", "recipes", "owner", ""]);

    expect(await askAdd(root, undefined, prompts)).toEqual({
      stack: "start",
      slug: slug("recipes"),
      access: { kind: "owner" },
      icon: "📦",
    });
  });

  it("asks again for a name that's taken, a platform app's or not a slug", async () => {
    const root = await installWithNotes();
    const { prompts, refused } = answering([
      "start",
      "notes",
      "hub",
      "Recipes!",
      "recipes",
      "owner",
      "",
    ]);

    expect(await askAdd(root, undefined, prompts)).toMatchObject({
      slug: slug("recipes"),
    });
    expect(refused).toEqual([
      "apps/notes already exists. Choose another name.",
      "hub is one of the platform apps: core, hub and admin.",
      "\"Recipes!\" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.",
    ]);
  });

  it("asks no name when it's given one", async () => {
    const root = await installWithNotes();
    const { prompts, asked } = answering(["start", "owner", ""]);

    expect(await askAdd(root, "recipes", prompts)).toMatchObject({
      slug: slug("recipes"),
    });
    expect(asked).not.toContain(questions.name);
  });

  it("refuses a given name that's taken before asking anything", async () => {
    const root = await installWithNotes();
    const { prompts, asked } = answering([]);

    const asking = askAdd(root, "notes", prompts);

    await expect(asking).rejects.toThrow(
      new CommandProblem("apps/notes already exists. Choose another name."),
    );
    expect(asked).toEqual([]);
  });

  it.each<[string, Answer[]]>([
    ["the stack", [cancel]],
    ["the name", ["start", cancel]],
    ["access", ["start", "recipes", cancel]],
    ["the roles", ["start", "recipes", "roles", cancel]],
    ["the icon", ["start", "recipes", "owner", cancel]],
  ])("stops, writing nothing, when cancelled at %s", async (_, given) => {
    const root = await installWithNotes();
    const { prompts } = answering(given);

    await expect(askAdd(root, undefined, prompts)).rejects.toThrow(
      new CommandProblem("Cancelled. Nothing was written."),
    );
  });
});

describe("appChoicesFromFlags", () => {
  it("takes the first stack, owner only and the default icon for flags left out", () => {
    expect(appChoicesFromFlags("recipes", {})).toEqual({
      stack: "start",
      slug: slug("recipes"),
      access: { kind: "owner" },
      icon: "📦",
    });
  });

  it("reads each flag, trimming the roles and dropping empty ones", () => {
    expect(
      appChoicesFromFlags("recipes", {
        stack: "react-hono",
        access: "roles",
        roles: " Family, Cooks ,",
        icon: "🍲",
      }),
    ).toEqual({
      stack: "react-hono",
      slug: slug("recipes"),
      access: { kind: "roles", roleNames: ["Family", "Cooks"] },
      icon: "🍲",
    });
  });

  it.each([
    [{ access: "roles" }, "--access roles needs --roles, naming at least one."],
    [
      { access: "roles", roles: " , " },
      "--access roles needs --roles, naming at least one.",
    ],
    [{ roles: "Family" }, "--roles only goes with --access roles."],
    [
      { access: "open", roles: "Family" },
      "--roles only goes with --access roles.",
    ],
    [
      { access: "anyone" },
      "--access anyone isn't an option. Choose from: owner, open, roles.",
    ],
  ])("refuses %o", (flags, message) => {
    expect(() => appChoicesFromFlags("recipes", flags)).toThrow(
      new CommandProblem(message),
    );
  });

  it("refuses a name that isn't a slug", () => {
    expect(() => appChoicesFromFlags("Recipes!", {})).toThrow(CommandProblem);
  });
});

describe("addCommandFor", () => {
  it("spells out every choice, quoting the roles", () => {
    expect(
      addCommandFor({
        stack: "react-hono",
        slug: slug("recipes"),
        access: { kind: "roles", roleNames: ["Family", "Cooks"] },
        icon: "🍲",
      }),
    ).toBe(
      'robkit add recipes --stack react-hono --access roles --roles "Family,Cooks" --icon 🍲',
    );
  });
});
