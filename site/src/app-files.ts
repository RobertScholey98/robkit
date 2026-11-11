// The files `robkit add` writes for an app on each stack, as the stack's
// guide lists them. A test holds each list to the stack's template, so a
// file the template gains or loses fails it and the guide hears of it.

import type { Stack } from "create-robkit";
import { treePaths, type TreeEntry } from "./install-tree.ts";

/** The migrations, and drizzle-kit's settings, for an app on Drizzle. */
const drizzleFiles: TreeEntry[] = [
  {
    name: "drizzle/",
    about: "The migrations. pnpm db:generate writes the next one.",
  },
  {
    name: "drizzle.config.ts",
    about: "Where drizzle-kit finds the tables and writes the migrations.",
  },
];

/** The files at the top of every app's folder, Go's included. */
const appRootFiles: TreeEntry[] = [
  {
    name: "package.json",
    about:
      "The app's scripts and packages, its emoji, and the access rule core starts from.",
  },
  { name: "tsconfig.json", about: "TypeScript's settings." },
  {
    name: "AGENTS.md",
    about: "How the app works, for a coding agent, and for you.",
  },
  { name: "CLAUDE.md", about: "Points Claude Code at AGENTS.md." },
];

/**
 * An app on React and a Node server that Vite runs, as `robkit add` writes
 * it. `server` says what `src/server.tsx` holds.
 */
function serverApp(server: string): TreeEntry[] {
  return [
    {
      name: "src/",
      about: "The app's code.",
      children: [
        { name: "schema.ts", about: "The app's tables." },
        {
          name: "database.ts",
          about: "Connects to the app's own schema, on first use.",
        },
        { name: "visits.ts", about: "The example's queries." },
        {
          name: "routes.tsx",
          about: "The routes, and the page they render with React.",
        },
        {
          name: "routes.test.tsx",
          about: "Tests the routes as the owner and as a guest.",
        },
        { name: "server.tsx", about: server },
        { name: "serve.ts", about: "Serves the built app in production." },
        {
          name: "styles.css",
          about: "Tailwind, with the install's shared UI kit and look.",
        },
      ],
    },
    ...drizzleFiles,
    {
      name: "vite.config.ts",
      about: "Runs the app under pnpm dev, and builds it for production.",
    },
    ...appRootFiles,
  ];
}

/** Each stack's files, from the app's folder, as its guide lists them. */
export const appFiles = {
  go: [
    {
      name: "main.go",
      about: "The server's commands: serve, dev and migrate.",
    },
    {
      name: "server.go",
      about:
        "The server: the guard in front, then the API under /api, then the page.",
    },
    { name: "visits.go", about: "The example's queries, in SQL with pgx." },
    {
      name: "server_test.go",
      about: "Tests the API as the owner, a guest and nobody.",
    },
    {
      name: "migrate.go",
      about:
        "The migrator. It applies each migration in migrations/ that hasn't run.",
    },
    {
      name: "migrations/",
      about: "The migrations, one .sql file each, run in name order.",
    },
    {
      name: "dev.go",
      about: "Runs Vite behind the server under pnpm dev.",
    },
    { name: "dev_test.go", about: "Tests what dev passes on from Vite." },
    {
      name: "go.mod",
      about:
        "The Go version, and robkit's Go module from the install's vendor/robkit/go.",
    },
    {
      name: "go.sum",
      about: "The checksums of the Go modules the server uses.",
    },
    { name: "index.html", about: "The page's HTML, which loads src/main.tsx." },
    {
      name: "src/",
      about: "The page.",
      children: [
        {
          name: "main.tsx",
          about: "Draws Home from src/home.tsx.",
        },
        {
          name: "home.tsx",
          about: "The page, in React. It calls the API with sessionFetch.",
        },
        {
          name: "home.test.tsx",
          about: "Tests the page in happy-dom, with fetch stubbed.",
        },
        {
          name: "styles.css",
          about: "Tailwind, with the install's shared UI kit and look.",
        },
      ],
    },
    {
      name: "vite.config.ts",
      about: "Serves the page under pnpm dev, and builds it into dist/public.",
    },
    ...appRootFiles,
  ],
  next: [
    {
      name: "src/",
      about: "The app's code.",
      children: [
        {
          name: "app/",
          about:
            "Next's app router. Each folder is a path, and its page.tsx the page there.",
          children: [
            {
              name: "layout.tsx",
              about: "The document every page sits in, and the stylesheet.",
            },
            {
              name: "page.tsx",
              about:
                "The home page. It reads the viewer and draws src/home.tsx.",
            },
            {
              name: "actions.ts",
              about: "The server action that records a visit.",
            },
            {
              name: "visit-again.tsx",
              about: "The visit count and its button, as a client component.",
            },
            {
              name: "visits/",
              about: "The page at /visits.",
              children: [
                { name: "page.tsx", about: "The viewer's latest visits." },
              ],
            },
          ],
        },
        { name: "schema.ts", about: "The app's tables." },
        {
          name: "database.ts",
          about: "Connects to the app's own schema, on first use.",
        },
        {
          name: "visits.ts",
          about:
            "The example's queries, and the plain function the action calls.",
        },
        {
          name: "home.tsx",
          about:
            "The home page as a plain function of the viewer, which a test can call.",
        },
        {
          name: "home.test.tsx",
          about: "Tests the home page as the owner and as a guest.",
        },
        {
          name: "proxy.ts",
          about:
            "Next's proxy. The guard runs here, before every page and action.",
        },
        { name: "serve.ts", about: "Serves the built app in production." },
        {
          name: "styles.css",
          about: "Tailwind, with the install's shared UI kit and look.",
        },
      ],
    },
    ...drizzleFiles,
    {
      name: "next.config.ts",
      about: "withRobkit(), with your own Next settings in its argument.",
    },
    { name: "postcss.config.js", about: "Runs Tailwind as a PostCSS plugin." },
    {
      name: ".gitignore",
      about: "Leaves out next-env.d.ts, which next dev and next build write.",
    },
    ...appRootFiles,
  ],
  start: [
    {
      name: "src/",
      about: "The app's code.",
      children: [
        {
          name: "routes/",
          about: "One file for each route. Start reads the routes from here.",
          children: [
            {
              name: "__root.tsx",
              about:
                "The document every page sits in: its head, the stylesheet and Start's scripts.",
            },
            {
              name: "index.tsx",
              about: "The page, its loader, and the server functions it calls.",
            },
          ],
        },
        { name: "schema.ts", about: "The app's tables." },
        {
          name: "database.ts",
          about: "Connects to the app's own schema, on first use.",
        },
        {
          name: "visits.ts",
          about:
            "The example's queries, and the plain functions the server functions call.",
        },
        { name: "home.tsx", about: "The page's card, in React." },
        {
          name: "home.test.tsx",
          about: "Tests what the page shows the owner and a guest.",
        },
        {
          name: "server.ts",
          about: "Start's server, with the guard in front.",
        },
        {
          name: "start.ts",
          about:
            "Sends server function calls through sessionFetch, so a lapsed session refreshes.",
        },
        { name: "router.tsx", about: "Makes the router from the route tree." },
        {
          name: "routeTree.gen.ts",
          about:
            "The route tree. Start writes it from src/routes, so don't edit it.",
        },
        { name: "serve.ts", about: "Serves the built app in production." },
        {
          name: "styles.css",
          about: "Tailwind, with the install's shared UI kit and look.",
        },
      ],
    },
    ...drizzleFiles,
    {
      name: "vite.config.ts",
      about: "Runs Start under pnpm dev, and builds it for production.",
    },
    ...appRootFiles,
  ],
  "react-hono": serverApp(
    "The Hono server. The guard runs first, then the routes.",
  ),
  express: serverApp("The Express app. The guard runs first, then the routes."),
} satisfies Partial<Record<Stack, TreeEntry[]>>;

/** What a list says that a folder's files don't, and the other way round. */
export interface FileListProblems {
  /** Files in the folder that no entry names, or sits above. */
  unlisted: string[];
  /** Entries no file in the folder has, or sits under. */
  missing: string[];
}

/**
 * Compares `entries` with `files`, each a path from the same folder. A file
 * entry names its file, and a folder entry with no children stands for
 * every file under it.
 */
export function compareFileList(
  entries: readonly TreeEntry[],
  files: readonly string[],
): FileListProblems {
  const paths = treePaths(entries);
  const leaves = paths.filter(
    (path) =>
      !path.endsWith("/") ||
      !paths.some((other) => other !== path && other.startsWith(path)),
  );
  const covers = (leaf: string, file: string) =>
    leaf.endsWith("/") ? file.startsWith(leaf) : file === leaf;
  return {
    unlisted: files.filter(
      (file) => !leaves.some((leaf) => covers(leaf, file)),
    ),
    missing: leaves.filter((leaf) => !files.some((file) => covers(leaf, file))),
  };
}
