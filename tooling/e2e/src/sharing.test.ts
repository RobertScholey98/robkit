import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { request } from "node:http";
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
import { updateApp } from "create-robkit";
import {
  defaultDomain,
  install,
  type Install,
} from "@robkit/session/addresses";
import postgres from "postgres";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { addedAppJourney } from "./added-app-journey.ts";
import { takeBrowserLog } from "./browser.ts";
import {
  changedHeading,
  greeting,
  ownEdit,
  seededNote,
  sharedSlug,
  updatedHeading,
  type Sharing,
} from "./sharing.ts";

const run = promisify(execFile);

/** One install's `pnpm dev`, on ports and a Postgres of its own. */
interface Dev {
  addresses: Install;
  adminUrl: string;
  /** What `pnpm dev` has said so far. */
  output: () => string;
  /** Stops pnpm dev and removes its Postgres, unless told to keep it. */
  stop: (options?: { keepDatabase?: boolean }) => Promise<void>;
}

function get(
  addresses: Install,
  slug: string,
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  const url = new URL(addresses.origin(slug));
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port: url.port,
        method: options.method ?? "GET",
        path: options.path ?? "/",
        headers: { host: url.host, ...options.headers },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers });
        });
      },
    )
      .on("error", reject)
      .end(options.body);
  });
}

/**
 * Starts `pnpm dev` in the install at `dir`. Its Postgres keeps its data in
 * memory, gone once it stops, unless `keepsData`, for a test that stops the
 * install and starts it again on the same `postgresPort`.
 */
async function startDev(
  dir: string,
  name: string,
  {
    keepsData = false,
    postgresPort,
  }: { keepsData?: boolean; postgresPort?: number } = {},
): Promise<Dev> {
  const devPort = await freePortBlock(1 + (await discoverApps(dir)).length);
  const addresses = install({ domain: defaultDomain, port: devPort });
  postgresPort ??= await freePostgresPort();
  const project = `robkit-e2e-sharing-${name}-${String(process.pid)}`;
  const tag = testTag();
  removeWhenGone({ tagged: tag }, { docker: project });
  let output = "";
  const dev: ChildProcess = spawn("pnpm", ["run", "dev"], {
    cwd: dir,
    env: {
      ...process.env,
      ROBKIT_DEV_PORT: String(devPort),
      ROBKIT_POSTGRES_PORT: String(postgresPort),
      COMPOSE_FILE: keepsData
        ? (process.env.COMPOSE_FILE ?? "compose.yaml")
        : testComposeFiles(),
      ROBKIT_TEST_TAG: tag,
      COMPOSE_PROJECT_NAME: project,
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  dev.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return {
    addresses,
    adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
    output: () => output,
    stop: async ({ keepDatabase = false } = {}) => {
      if (dev.exitCode === null && dev.pid) {
        process.kill(-dev.pid, "SIGINT");
        await once(dev, "exit");
      }
      if (keepDatabase) return;
      await run("docker", ["compose", "-p", project, "down", "-v"], {
        cwd: dir,
      });
    },
  };
}

/** Waits until `slug` answers `status`, which says pnpm dev is up. */
async function answers(dev: Dev, slug: string, status: number): Promise<void> {
  const deadline = Date.now() + 150_000;
  for (;;) {
    const reply = await get(dev.addresses, slug).catch(() => undefined);
    if (reply?.status === status) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${slug} never answered ${String(status)}:\n${dev.output().slice(-8000)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Claims the install for an owner, so guests can sign in at the hub. */
async function claim(dev: Dev): Promise<void> {
  const { status } = await get(dev.addresses, "core", {
    method: "POST",
    path: "/setup",
    headers: {
      origin: dev.addresses.origin("hub"),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "rob",
      password: "correct horse battery",
    }),
  });
  expect(status).toBe(201);
}

async function rows(adminUrl: string, query: string): Promise<unknown[]> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    return [...(await sql.unsafe(query))];
  } finally {
    await sql.end();
  }
}

async function files(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true }))
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(path))
    .sort();
}

// R's acceptance test for sharing an app (2026-11-05). The global setup
// makes both installs and moves the apps, as R would at a terminal; this
// suite checks what that left, then runs each install and opens the
// imported apps in a browser as a guest.
describe("sharing apps between installs", () => {
  const sharing: Sharing = inject("sharing");

  beforeEach(({ onTestFailed }) => {
    takeBrowserLog();
    onTestFailed(() => {
      console.error(`What the browser saw:\n${takeBrowserLog()}`);
    });
  });

  it("exports a repo that installs, lints, typechecks and tests on its own", () => {
    expect(sharing.standalone).toEqual([
      { command: "pnpm install --no-frozen-lockfile", ok: true, output: "" },
      { command: "pnpm lint", ok: true, output: "" },
      { command: "pnpm typecheck", ok: true, output: "" },
      { command: "pnpm test", ok: true, output: "" },
    ]);
  });

  it("copies the install code the app uses into the export's shared/, and maps it back in install B", async () => {
    const exported = await files(sharing.exported);
    const imported = await files(join(sharing.b, "apps", sharedSlug));

    expect(exported).toEqual(
      expect.arrayContaining([
        "shared/ui/src/components/ui/button.tsx",
        "shared/theme/theme.css",
        "shared/tsconfig/base.json",
      ]),
    );
    expect(imported.filter((path) => path.startsWith("shared"))).toEqual([]);
  });

  it("carries install A's change to install B as a migration and a seed", async () => {
    const app = join(sharing.b, "apps", sharedSlug);

    const migrations = (await readdir(join(app, "drizzle"))).filter((file) =>
      file.endsWith(".sql"),
    );

    expect(migrations).toEqual(["0000_init.sql", "0001_notes.sql"]);
    expect(
      await readFile(join(app, "drizzle/0001_notes.sql"), "utf8"),
    ).toContain('CREATE TABLE "note"');
    expect(await readFile(join(app, "src/routes/index.tsx"), "utf8")).toContain(
      `"${greeting} Signed in as the owner"`,
    );
    expect(existsSync(join(app, "seed.sql"))).toBe(true);
  });

  it("commits the export to a git repository of its own", async () => {
    const { stdout } = await run("git", ["log", "--format=%s"], {
      cwd: sharing.exported,
    });

    expect(stdout.trim().split("\n")).toEqual([
      `Export ${sharedSlug} again`,
      `Export ${sharedSlug} from a robkit install`,
    ]);
  });

  it(
    "lets a guest open the guestbook install A imported, signed twice by its seed",
    { timeout: 300_000 },
    async () => {
      const dev = await startDev(sharing.a, "a");
      try {
        await answers(dev, "hub", 200);
        await answers(dev, "guestbook", 200);
        await claim(dev);

        const journey = await addedAppJourney({
          install: dev.addresses,
          slug: "guestbook",
        });
        const page = await get(dev.addresses, "guestbook");

        expect(journey).toEqual({
          icon: "📖",
          openedAt: `${dev.addresses.origin("guestbook")}/`,
          heading: "Guestbook",
        });
        expect(page.body).toContain("Welcome to the guestbook. Sign it below.");
        expect(page.body).toContain("Lovely to see everyone here!");
      } finally {
        await dev.stop();
      }
    },
  );

  it(
    "lets a guest open the app install B imported, with install A's change, table and seed, then updates it keeping B's edit and data",
    { timeout: 600_000 },
    async () => {
      const notes = `select body from ${sharedSlug}.note order by id`;
      const first = await startDev(sharing.b, "b", { keepsData: true });
      let opened: unknown;
      let seeded: unknown;
      const postgresPort = Number(new URL(first.adminUrl).port);
      try {
        await answers(first, "hub", 200);
        await answers(first, sharedSlug, 200);
        await claim(first);
        opened = await addedAppJourney({
          install: first.addresses,
          slug: sharedSlug,
        });
        seeded = await rows(first.adminUrl, notes);
        // Data of install B's own, which the update must keep.
        await rows(
          first.adminUrl,
          `insert into ${sharedSlug}.note (body) values ('Written in install B')`,
        );
      } finally {
        await first.stop({ keepDatabase: true });
      }

      const updated = await updateApp(sharing.b, sharedSlug);

      const second = await startDev(sharing.b, "b", {
        keepsData: true,
        postgresPort,
      });
      try {
        await answers(second, "hub", 200);
        await answers(second, sharedSlug, 200);
        const reopened = await addedAppJourney({
          install: second.addresses,
          slug: sharedSlug,
        });

        expect({ opened, seeded }).toEqual({
          opened: {
            icon: "📝",
            openedAt: `${first.addresses.origin(sharedSlug)}/`,
            heading: changedHeading,
          },
          seeded: [{ body: seededNote }],
        });
        expect(updated).toMatchObject({ changed: true, conflicts: [] });
        expect(reopened.heading).toBe(updatedHeading);
        expect(
          await readFile(
            join(sharing.b, "apps", sharedSlug, ownEdit.file),
            "utf8",
          ),
        ).toContain(ownEdit.to);
        // The schema and its data stayed, and the seed didn't run again.
        expect(await rows(second.adminUrl, notes)).toEqual([
          { body: seededNote },
          { body: "Written in install B" },
        ]);
      } finally {
        await second.stop();
      }
    },
  );
});
