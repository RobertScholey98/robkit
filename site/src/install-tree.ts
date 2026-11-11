// What a new install holds, from "Where things are" in its README. A test
// finds each entry in the templates, so a folder the templates lose fails
// it.

import { readyStacks } from "create-robkit";

export interface TreeEntry {
  /** Its name in its folder. A folder's ends with `/`. */
  name: string;
  /** What it's for, in a line. */
  about: string;
  children?: TreeEntry[];
}

/** A new install's folders and the files a reader opens first. */
export const installTree: TreeEntry[] = [
  {
    name: "apps/",
    about:
      "One folder for each app. Its name is the app's slug, which names its subdomain and its database schema too.",
    children: [
      {
        name: "core/",
        about:
          "Runs core, which holds the owner, the access codes, the roles and the sessions.",
      },
      { name: "hub/", about: "Where people sign in and open apps." },
      {
        name: "admin/",
        about:
          "Where you make access codes and roles, and say who may open each app.",
      },
      {
        name: "example/",
        about: "The example app, on the stack you chose.",
      },
    ],
  },
  {
    name: "packages/",
    about: "What the apps share.",
    children: [
      { name: "ui/", about: "The UI kit." },
      { name: "theme/", about: "The look." },
      {
        name: "core-client/",
        about: "The client the hub and admin call core with.",
      },
    ],
  },
  {
    name: "docs/deploy.md",
    about: "How to host the install on Coolify.",
  },
  {
    name: "AGENTS.md",
    about:
      "The settings pnpm dev reads, the layer rule, databases and production.",
  },
  { name: "README.md", about: "The install's commands, and where things are." },
];

/** Each entry's path from the install's root, in the tree's order. */
export function treePaths(
  entries: readonly TreeEntry[],
  parent = "",
): string[] {
  return entries.flatMap(({ name, children = [] }) => [
    parent + name,
    ...treePaths(children, parent + name),
  ]);
}

/**
 * Where the templates keep an install's `path`: the example app in each
 * stack's template, and everything else in the base template.
 */
export function templatesFor(path: string): string[] {
  const inInstall = path.replace(/\/$/, "");
  return inInstall === "apps/example"
    ? readyStacks.map((stack) => `stacks/${stack}`)
    : [`base/${inInstall}`];
}
