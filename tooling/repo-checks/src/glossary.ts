import { glob, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { matchesGlob } from "node:path/posix";

/** A word `GLOSSARY.md` tells you not to use for one of its terms. */
export interface AvoidWord {
  term: string;
  word: string;
}

/** A file's text, with its path from the repo root. */
export interface ScannedFile {
  file: string;
  text: string;
}

/** Where an Avoid word is right in context, and why. */
export interface Exceptions {
  /** Words with a second meaning robkit uses, which no check can tell apart. */
  everywhere: Readonly<Record<string, string>>;
  /** Lines where a word is right: a third-party name, a quote, a definition. */
  at: readonly {
    word: string;
    /** A glob for the files it covers. Without one, it covers every file. */
    file?: string;
    /** Text on the line, in any case, which must be there for it to apply. */
    text: string;
    why: string;
  }[];
}

const thisFile = "tooling/repo-checks/src/glossary.ts";

export const exceptions: Exceptions = {
  everywhere: {
    admin:
      "Admin is also the platform app. The glossary avoids it only for the person.",
    cookie:
      "robkit sets HTTP cookies. The glossary avoids the word only as a name for the session token.",
    password:
      "The owner signs in with a password, and each app's Postgres role has one.",
    config: "Tools have config files: ESLint, Vite, TypeScript, Coolify.",
    project: "Compose and Coolify name their own projects.",
    deployment: "`robkit deploy` makes Coolify deployments.",
  },
  at: [
    // Other tools' words.
    {
      word: "user",
      text: "postgres://user:password@",
      why: "A Postgres URL's syntax.",
    },
    {
      word: "service",
      file: "packages/create-robkit/{src/coolify-api.ts,templates/base/docs/deploy.md}",
      text: "service token",
      why: "Cloudflare Access's name for a token a program holds.",
    },
    {
      word: "service",
      file: "packages/create-robkit/templates/base/compose.yaml",
      text: "services:",
      why: "Compose's key for its containers.",
    },
    {
      word: "user",
      file: "packages/create-robkit/templates/base/Dockerfile",
      text: "USER node",
      why: "Docker's instruction for the user a container runs as.",
    },
    {
      word: "plugin",
      file: "packages/create-robkit/templates/**/vite.config.ts",
      text: "plugin",
      why: "Vite's word for what extends it.",
    },
    {
      word: "plugin",
      file: "packages/create-robkit/templates/stacks/next/{postcss.config.js,tsconfig.json}",
      text: "plugin",
      why: "PostCSS's and TypeScript's word for what extends them.",
    },
    {
      word: "group",
      file: "packages/create-robkit/templates/base/packages/ui/src/components/ui/*.tsx",
      text: "group",
      why: "shadcn's components, as its CLI writes them: Tailwind's group variants and Base UI's RadioGroup.",
    },
    {
      word: "grant",
      file: "packages/dev/src/provision.ts",
      text: "grant",
      why: "Postgres's GRANT.",
    },
    {
      word: "group",
      text: "process group",
      why: "A Unix process group.",
    },
    {
      word: "group",
      file: "packages/dev/src/{process-group,failures}*.ts",
      text: "group",
      why: "A Unix process group: stopGroup stops an app by its group.",
    },
    {
      word: "middleware",
      file: "packages/{hono,express,start,create-robkit/templates/stacks/{react-hono,express}}/**",
      text: "middleware",
      why: "Hono's, Express's, Vite's and TanStack Start's word for what an adapter hands them.",
    },
    {
      word: "middleware",
      file: "go/session/guarded.go",
      text: "middleware",
      why: "Go's word for a func(http.Handler) http.Handler, which Guarded is.",
    },
    {
      word: "user",
      file: "go/session/*.go",
      text: ".User",
      why: "Go's url.URL keeps a URL's user info in its User field.",
    },
    {
      word: "backend",
      text: "BuildKit cache backend",
      why: "BuildKit's word.",
    },
    {
      word: "JWT",
      text: "A session token is a JWT",
      why: "The token's format.",
    },
    // The layer rule's frameworks are Hono, React and the like, not stacks.
    { word: "framework", text: "import no framework", why: "The layer rule." },
    { word: "framework", text: "imports no framework", why: "The layer rule." },
    { word: "framework", text: "Import a framework", why: "The layer rule." },
    // What core and the hub are, in the glossary's own definitions.
    {
      word: "backend",
      text: "**Core** is the backend",
      why: "Core's definition.",
    },
    { word: "backend", text: "Core, the backend", why: "Core's definition." },
    {
      word: "backend",
      text: "@robkit/core<br/>the backend",
      why: "Core's definition.",
    },
    {
      word: "backend",
      text: "Core: the Hono backend",
      why: "Core's definition.",
    },
    {
      word: "backend",
      text: "Core is its own Hono backend",
      why: "Core's definition.",
    },
    {
      word: "backend",
      text: "Core is its own backend",
      why: "Core's definition.",
    },
    {
      word: "frontend",
      text: "The hub is a small React frontend",
      why: "The hub's definition.",
    },
    // Quotes: the old words, and the titles of tickets.
    {
      word: "grant",
      file: "docs/adr/0006-roles-gate-apps.md",
      text: "grant",
      why: "The record of what roles replaced.",
    },
    {
      word: "frontend",
      file: "docs/agents/domain.md",
      text: 'never "frontend"',
      why: "Names the words to avoid.",
    },
    {
      word: "backend",
      file: "docs/agents/domain.md",
      text: '"backend"',
      why: "Names the words to avoid.",
    },
    {
      word: "grant",
      file: "docs/agents/domain.md",
      text: 'never "grant"',
      why: "Names the words to avoid.",
    },
    {
      word: "per-app session",
      text: "[Per-app session tokens](",
      why: "A ticket's title.",
    },
    {
      word: "user",
      text: "[What does a robkit user upgrade, and how?](",
      why: "A ticket's title.",
    },
  ],
};

/** Each term's `_Avoid_` words, as `GLOSSARY.md` lists them. */
export function avoidWords(glossary: string): AvoidWord[] {
  const words: AvoidWord[] = [];
  let term: string | undefined;
  for (const line of glossary.split("\n")) {
    const heading = /^\*\*(.+)\*\*:\s*$/.exec(line);
    if (heading?.[1] !== undefined) term = heading[1];
    const avoid = /^_Avoid_:\s*(.+)$/.exec(line);
    if (avoid?.[1] === undefined || term === undefined) continue;
    for (const entry of avoid[1].split(",")) {
      // "admin (for the person)": the qualifier says when, not what.
      const word = entry.replace(/\(.*\)/, "").trim();
      if (word !== "") words.push({ term, word });
    }
  }
  return words;
}

/** An Avoid word, with every term the glossary avoids it for. */
interface Avoided {
  word: string;
  terms: string[];
}

interface Hit {
  file: string;
  line: number;
  lineText: string;
  index: number;
  found: string;
  avoid: Avoided;
}

function byWord(words: readonly AvoidWord[]): Avoided[] {
  const found = new Map<string, Avoided>();
  for (const { term, word } of words) {
    const key = word.toLowerCase();
    const avoided = found.get(key) ?? { word, terms: [] };
    avoided.terms.push(term);
    found.set(key, avoided);
  }
  return [...found.values()];
}

/** `"Owner"`, `"Owner" or "Guest"`, `"Owner", "Guest" or "Viewer"`. */
function either(terms: readonly string[]): string {
  const quoted = terms.map((term) => `"${term}"`);
  const last = quoted.pop() ?? "";
  return quoted.length === 0 ? last : `${quoted.join(", ")} or ${last}`;
}

/** The word, or phrase, as a whole word in any case, or plural. */
function pattern(word: string): RegExp {
  const escaped = word
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<![\\w-])${escaped}s?(?![\\w-])`, "gi");
}

function hitsIn(
  files: readonly ScannedFile[],
  words: readonly AvoidWord[],
): Hit[] {
  return files.flatMap(({ file, text }) => {
    const lines = text.split("\n");
    let offset = 0;
    const lineStarts = lines.map((line) => {
      const start = offset;
      offset += line.length + 1;
      return start;
    });
    return byWord(words)
      .flatMap((avoid) =>
        [...text.matchAll(pattern(avoid.word))].map((match) => {
          const line = lineStarts.findLastIndex((at) => at <= match.index);
          return {
            file,
            line: line + 1,
            lineText: lines[line] ?? "",
            index: match.index,
            found: match[0].replace(/\s+/g, " "),
            avoid,
          };
        }),
      )
      .sort((a, b) => a.index - b.index);
  });
}

function excepted(hit: Hit, { everywhere, at }: Exceptions): boolean {
  const word = hit.avoid.word.toLowerCase();
  return (
    Object.hasOwn(everywhere, word) ||
    at.some(
      (exception) =>
        exception.word.toLowerCase() === word &&
        (exception.file === undefined ||
          matchesGlob(hit.file, exception.file)) &&
        hit.lineText.toLowerCase().includes(exception.text.toLowerCase()),
    )
  );
}

/** Each use of an Avoid word that no exception covers. */
export function glossaryProblems(
  files: readonly ScannedFile[],
  words: readonly AvoidWord[],
  allowed: Exceptions,
): string[] {
  return hitsIn(files, words)
    .filter((hit) => !excepted(hit, allowed))
    .map(
      ({ file, line, found, avoid }) =>
        `${file}:${String(line)} says "${found}", which GLOSSARY.md avoids. Say ${either(avoid.terms)} instead.`,
    );
}

/** Exceptions that no longer apply, so they can't hide a later slip. */
export function unusedExceptions(
  files: readonly ScannedFile[],
  words: readonly AvoidWord[],
  allowed: Exceptions,
): string[] {
  const avoided = new Set(words.map(({ word }) => word.toLowerCase()));
  const hits = hitsIn(files, words);
  return [
    ...Object.keys(allowed.everywhere)
      .filter((word) => !avoided.has(word.toLowerCase()))
      .map(
        (word) =>
          `The exception for "${word}" everywhere names a word GLOSSARY.md doesn't avoid. Delete it from ${thisFile}.`,
      ),
    ...allowed.at
      .filter(
        (exception) =>
          !hits.some((hit) =>
            excepted(hit, { everywhere: {}, at: [exception] }),
          ),
      )
      .map(
        ({ word, text }) =>
          `The exception for "${word}" at "${text}" matches no line. Delete it from ${thisFile}.`,
      ),
  ];
}

/**
 * The files the check reads: each published package's source and README,
 * the Go module's source and README, create-robkit's templates, `docs/`,
 * `README.md` and `AGENTS.md`.
 * Snapshots and drizzle-kit's migrations are generated, so it skips them.
 */
export async function readScannedFiles(root: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for await (const entry of glob(
    [
      "packages/*/src/**/*",
      "packages/*/README.md",
      "go/**/*.go",
      "go/README.md",
      // An install's own code, docs and pages.
      "packages/create-robkit/templates/**/*",
      "docs/**/*.md",
      "README.md",
      "AGENTS.md",
    ],
    {
      cwd: root,
      withFileTypes: true,
      exclude: (dirent) =>
        ["node_modules", "dist", "__snapshots__", "drizzle"].includes(
          dirent.name,
        ),
    },
  )) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      file: relative(root, path).replaceAll("\\", "/"),
      text: await readFile(path, "utf8"),
    });
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
