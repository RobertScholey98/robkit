// R's test of sharing an app between installs, end to end: one install
// takes a sample app from its own repo, adds an app and shares it, a second
// install takes that app, and a later share reaches the second install
// through robkit update. A guest opens each app from the hub's launcher.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  freePortBlock,
  freePostgresPort,
  removeWhenGone,
  testComposeFiles,
  testTag,
} from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import {
  defaultDomain,
  install,
  type Install,
} from "@robkit/session/addresses";
import { init } from "create-robkit";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addedAppJourney } from "./added-app-journey.ts";
import { takeBrowserLog } from "./browser.ts";
import { sampleAppRepo } from "./sample-app.ts";

const run = promisify(execFile);

/** The Start app's page, which install A changes and shares. */
const page = "src/routes/index.tsx";
const guestHeading = 'return "Signed in as a guest";';
const sharedHeading = 'return "Notes from install A";';
const updatedHeading = 'return "Notes from install A, shared again";';
const viewerLabel = "Viewer id:";
const ownLabel = "Your id in install B:";

/** An install's ports and Compose project, kept across restarts. */
interface Stack {
  dir: string;
  project: string;
  composeFile: string;
  devPort: number;
  postgresPort: number;
  addresses: Install;
  adminUrl: string;
  dev?: ChildProcess;
  output: string;
}

let parent: string;
/** Every stack made, for afterAll to stop even if beforeAll failed. */
const stacks: Stack[] = [];
let a: Stack;
let b: Stack;
let shareOutput: string;

/** Runs the install's robkit, as `pnpm robkit` does. */
async function robkit(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("pnpm", ["--silent", "run", "robkit", ...args], {
    cwd: dir,
  });
  return stdout;
}

/** Replaces `from` in `file`, which must hold it. */
async function edit(file: string, from: string, to: string): Promise<void> {
  const text = await readFile(file, "utf8");
  if (!text.includes(from)) throw new Error(`${file} has no ${from}`);
  await writeFile(file, text.replace(from, to));
}

async function stackFor(dir: string, name: string): Promise<Stack> {
  const devPort = await freePortBlock(1 + (await discoverApps(dir)).length);
  const postgresPort = await freePostgresPort();
  const project = `robkit-e2e-share-${name}-${String(process.pid)}`;
  const stack: Stack = {
    dir,
    project,
    // Install B's database outlives a restart of pnpm dev, so the test can
    // see its seed isn't run twice. In memory it would be gone on stop.
    composeFile:
      name === "b"
        ? (process.env.COMPOSE_FILE ?? "compose.yaml")
        : testComposeFiles(),
    devPort,
    postgresPort,
    addresses: install({ domain: defaultDomain, port: devPort }),
    adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
    output: "",
  };
  stacks.push(stack);
  return stack;
}

function send(
  stack: Stack,
  slug: string,
  path: string,
  { method = "GET", body }: { method?: string; body?: string } = {},
): Promise<number> {
  const origin = stack.addresses.origin("hub");
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port: stack.devPort,
        method,
        path,
        headers: {
          host: new URL(stack.addresses.origin(slug)).host,
          origin,
          "content-type": "application/json",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve(res.statusCode ?? 0);
        });
      },
    )
      .on("error", reject)
      .end(body);
  });
}

/** Waits until `slug` answers 200 at `path`. */
async function served(stack: Stack, slug: string, path = "/"): Promise<void> {
  const deadline = Date.now() + 180_000;
  while ((await send(stack, slug, path).catch(() => 0)) !== 200) {
    if (Date.now() > deadline) {
      throw new Error(`${slug} never came up:\n${stack.output.slice(-8000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Starts pnpm dev in the install, and waits for core and `slug`. */
async function startDev(stack: Stack, slug: string): Promise<void> {
  const tag = testTag();
  removeWhenGone({ tagged: tag }, { docker: stack.project });
  stack.dev = spawn("pnpm", ["run", "dev"], {
    cwd: stack.dir,
    env: {
      ...process.env,
      ROBKIT_DEV_PORT: String(stack.devPort),
      ROBKIT_POSTGRES_PORT: String(stack.postgresPort),
      COMPOSE_FILE: stack.composeFile,
      ROBKIT_TEST_TAG: tag,
      COMPOSE_PROJECT_NAME: stack.project,
    },
    // Its own process group, so SIGINT reaches it the way Ctrl-C would.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const note = (chunk: Buffer) => (stack.output += chunk.toString());
  stack.dev.stdout?.on("data", note);
  stack.dev.stderr?.on("data", note);
  await served(stack, "core", "/status");
  await served(stack, slug);
}

/** Stops pnpm dev as Ctrl-C would: its apps, then Postgres. */
async function stopDev(stack: Stack): Promise<void> {
  const { dev } = stack;
  if (!dev?.pid || dev.exitCode !== null) return;
  const exited = once(dev, "exit");
  process.kill(-dev.pid, "SIGINT");
  const late = setTimeout(() => {
    if (dev.pid) process.kill(-dev.pid, "SIGKILL");
  }, 60_000);
  await exited;
  clearTimeout(late);
}

/** Claims the install for an owner, so the hub lets guests sign in. */
async function claim(stack: Stack): Promise<void> {
  const status = await send(stack, "core", "/setup", {
    method: "POST",
    body: JSON.stringify({
      username: "rob",
      password: "correct horse battery",
    }),
  });
  if (status !== 201) throw new Error(`claiming answered ${String(status)}`);
}

async function rows(stack: Stack, query: string): Promise<unknown[]> {
  const sql = postgres(stack.adminUrl, { max: 1, onnotice: () => undefined });
  try {
    return [...(await sql.unsafe(query))];
  } finally {
    await sql.end();
  }
}

beforeAll(async () => {
  parent = await mkdtemp(join(tmpdir(), "robkit-share-"));

  // The sample lives in its own repo, outside any install.
  const guestbook = await sampleAppRepo(parent);

  // Install A takes the sample, adds an app on another stack and changes
  // its page and schema.
  const dirA = join(parent, "a");
  await init({ exampleStack: "react-hono" }, dirA, {
    link: true,
    install: true,
  });
  await robkit(dirA, "install", guestbook);
  await robkit(dirA, "add", "notes", "--stack", "start", "--access", "open");
  const notes = join(dirA, "apps", "notes");
  await edit(join(notes, page), guestHeading, sharedHeading);
  await writeFile(
    join(notes, "src", "schema.ts"),
    `${await readFile(join(notes, "src", "schema.ts"), "utf8")}
/** A note install A seeds. */
export const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
`,
  );
  await run("pnpm", ["--silent", "run", "db:generate"], { cwd: notes });
  await writeFile(
    join(notes, "seed.sql"),
    "insert into note (body) values ('Seeded in install A');\n",
  );
  shareOutput = await robkit(dirA, "share", "notes");

  // Install B takes the shared app.
  const dirB = join(parent, "b");
  await init({ exampleStack: "start" }, dirB, { link: true, install: true });
  await robkit(dirB, "install", join(parent, "robkit-apps", "notes.git"));

  a = await stackFor(dirA, "a");
  b = await stackFor(dirB, "b");
}, 900_000);

// A journey that times out says only what it waited for. Print what the
// browser saw and what pnpm dev said meanwhile.
beforeEach(({ onTestFailed }) => {
  takeBrowserLog();
  onTestFailed(() => {
    console.error(
      `What the browser saw:\n${takeBrowserLog()}\n\nWhat pnpm dev said in A:\n${a.output.slice(-6000)}\n\nWhat pnpm dev said in B:\n${b.output.slice(-6000)}`,
    );
  });
});

afterAll(async () => {
  for (const stack of stacks) {
    await stopDev(stack);
    await run("docker", ["compose", "-p", stack.project, "down", "-v"], {
      cwd: stack.dir,
      env: { ...process.env, COMPOSE_FILE: stack.composeFile },
    });
  }
  await rm(parent, { recursive: true, force: true });
}, 180_000);

describe("sharing an app between installs", () => {
  it("shares the app to a new bare repository beside the install", () => {
    const source = join(parent, "robkit-apps", "notes.git");

    expect(shareOutput).toContain(
      `Shared apps/notes to ${source}, a new bare repository`,
    );
    expect(shareOutput).toContain(`pnpm robkit install ${source}`);
  });

  it("serves the sample app from its repo, seeded, to a guest from the launcher", async () => {
    await startDev(a, "guestbook");
    try {
      await claim(a);

      const journey = await addedAppJourney({
        install: a.addresses,
        slug: "guestbook",
      });

      expect(journey).toEqual({
        icon: "📖",
        openedAt: `${a.addresses.origin("guestbook")}/`,
        heading: "Guestbook",
        // Newest first.
        text: expect.stringContaining(
          "The seed: This message came from seed.sql.\nRobkit: Welcome to the guestbook.",
        ) as string,
      });
    } finally {
      await stopDev(a);
    }
  });

  it("serves the shared app in the other install with its change, table and seed", async () => {
    await startDev(b, "notes");
    try {
      await claim(b);

      const journey = await addedAppJourney({
        install: b.addresses,
        slug: "notes",
      });
      const notes = await rows(b, "select body from notes.note");

      expect([journey.openedAt, journey.heading]).toEqual([
        `${b.addresses.origin("notes")}/`,
        "Notes from install A",
      ]);
      expect(notes).toEqual([{ body: "Seeded in install A" }]);
    } finally {
      await stopDev(b);
    }
  });

  it("brings the next share into the other install and keeps its own edit", async () => {
    await edit(
      join(a.dir, "apps", "notes", page),
      sharedHeading,
      updatedHeading,
    );
    await robkit(a.dir, "share", "notes");
    await edit(join(b.dir, "apps", "notes", page), viewerLabel, ownLabel);

    const updated = await robkit(b.dir, "update", "notes");
    await startDev(b, "notes");
    try {
      const journey = await addedAppJourney({
        install: b.addresses,
        slug: "notes",
      });
      const notes = await rows(b, "select body from notes.note");

      expect(updated).toContain(
        `Brought 1 commit into apps/notes from ${join(parent, "robkit-apps", "notes.git")}.`,
      );
      expect(journey.heading).toBe("Notes from install A, shared again");
      expect(journey.text).toContain(ownLabel);
      // The seed ran once, when the first pnpm dev made the app's schema.
      expect(notes).toEqual([{ body: "Seeded in install A" }]);
    } finally {
      await stopDev(b);
    }
  });
});
