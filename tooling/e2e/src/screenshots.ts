// Takes the screenshots robkit.dev shows, from an install this makes,
// starts and stops itself. Run it from the repo's root as
// `pnpm screenshots`. It needs Docker and Linux, as the whole-stack tests
// do, and port 3000 free: `pnpm dev` runs there as it does for an owner,
// so the addresses in the pictures are the ones a reader sees.
//
// Every name, code and role is fixed, so two runs give the same pictures.
// The codes are made for the pictures and die with the install.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Page } from "playwright";
import { freePostgresPort } from "@internal/test-postgres";
import { isRecord } from "@robkit/input";
import { defaultDevPort, defaultDomain } from "@robkit/input/addresses";
import { launch, networkIdle } from "./browser.ts";
import { createInstall, exampleSlug } from "./install.ts";

const run = promisify(execFile);

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
/** Where the site keeps the screenshots, beside the record of what made them. */
const shotsDir = join(repoRoot, "site/src/screenshots");
/** The command that runs this, as the record names it. */
const command = "pnpm screenshots";

const owner = { username: "robin", password: "correct horse battery" };

/** The apps the launcher shows beside the example, each added as an owner would. */
const apps = [
  {
    slug: "notes",
    icon: "📝",
    access: ["--access", "roles", "--roles", "Family"],
  },
  {
    slug: "recipes",
    icon: "🍲",
    access: ["--access", "roles", "--roles", "Family,Friends"],
  },
  { slug: "photos", icon: "📷", access: ["--access", "owner"] },
] as const;

/** The guests' codes, and the roles each holds. */
const guests = [
  { name: "Grandma", code: "MAPLE7", roles: ["Family"] },
  { name: "Sam", code: "HARBOR3", roles: ["Family", "Friends"] },
  { name: "Alex", code: "LANTERN9", roles: ["Friends"] },
] as const;

const origin = (slug: string) =>
  `http://${slug}.${defaultDomain}:${String(defaultDevPort)}`;

/** What `slug` answers through the dev proxy, or 0 while nothing does. */
function statusOf(slug: string): Promise<number> {
  return new Promise((resolve) => {
    request(
      {
        host: "127.0.0.1",
        port: defaultDevPort,
        path: "/",
        headers: { host: new URL(origin(slug)).host },
        agent: false,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    )
      // Refused while pnpm dev starts: ask again.
      .on("error", () => {
        resolve(0);
      })
      .end();
  });
}

/** Waits until each of `slugs` answers with something but the proxy's 502. */
async function answering(slugs: readonly string[], dev: () => string) {
  const deadline = Date.now() + 300_000;
  for (const slug of slugs) {
    for (;;) {
      const status = await statusOf(slug);
      if (status !== 0 && status !== 502) break;
      if (Date.now() > deadline) {
        throw new Error(`${slug} never answered. pnpm dev said:\n${dev()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** A running install: its folder, its `pnpm dev`, and what that has said. */
interface Running {
  dir: string;
  dev: ChildProcess;
  said: () => string;
}

/** Makes the install and starts `pnpm dev` in it. */
async function startInstall(): Promise<Running> {
  const dir = await createInstall(
    { exampleStack: "react-hono" },
    { add: false },
  );
  let said = "";
  const dev = spawn("pnpm", ["run", "dev"], {
    cwd: dir,
    env: {
      ...process.env,
      // A port the shell sets wins, for a machine that keeps some free.
      ROBKIT_POSTGRES_PORT:
        process.env.ROBKIT_POSTGRES_PORT ?? String(await freePostgresPort()),
    },
    // Its own process group, as a terminal's job, so SIGINT stops it all.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", (chunk: Buffer) => (said += chunk.toString()));
  dev.stderr.on("data", (chunk: Buffer) => (said += chunk.toString()));
  const running = { dir, dev, said: () => said.slice(-8000) };
  await answering(["hub", "core", "admin", exampleSlug], running.said);
  return running;
}

/** Adds the apps with robkit add while `pnpm dev` runs, as an owner would. */
async function addApps({ dir, said }: Running) {
  for (const { slug, icon, access } of apps) {
    await run(
      "pnpm",
      [
        "run",
        "robkit",
        "add",
        slug,
        "--stack",
        "react-hono",
        ...access,
        "--icon",
        icon,
      ],
      { cwd: dir },
    );
  }
  await answering(
    apps.map(({ slug }) => slug),
    said,
  );
}

/** Stops `pnpm dev` as Ctrl+C would, then removes its Postgres and the install. */
async function stopInstall({ dir, dev }: Running) {
  if (dev.pid !== undefined && dev.exitCode === null) {
    process.kill(-dev.pid, "SIGINT");
    await once(dev, "exit");
  }
  await run("docker", ["compose", "down", "--volumes"], { cwd: dir });
  await rm(dir, { recursive: true, force: true });
}

/**
 * The window the hub and the app are shot in: small enough that their
 * cards fill it, so they read at the width of the site's column.
 */
const small = { width: 800, height: 500 };
/** The window admin is shot in, wide enough for its table of codes. */
const wide = { width: 1024, height: 640 };
/**
 * How long a page may take to load or show something. Apps that robkit add
 * has just started can be slow, on a machine doing other work.
 */
const pageTimeout = 120_000;
/** The room left around part of a page, in CSS pixels. */
const margin = 16;

/** Saves what `page`, or part of it with a margin, shows as `name`.png. */
async function shoot(
  page: Page,
  name: string,
  part?: ReturnType<Page["locator"]>,
  mask: ReturnType<Page["locator"]>[] = [],
) {
  await networkIdle(page);
  const box = part ? await part.boundingBox() : null;
  if (part && !box) throw new Error(`${name}: the part to shoot isn't shown.`);
  // A box is in the window's pixels, and a clip of the full page in the
  // page's, so the scroll goes back in.
  const scrolled = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await page.screenshot({
    path: join(shotsDir, `${name}.png`),
    animations: "disabled",
    caret: "hide",
    mask,
    maskColor: "#e5e5e5",
    ...(box && {
      fullPage: true,
      clip: {
        x: Math.max(0, Math.floor(box.x + scrolled.x - margin)),
        y: Math.max(0, Math.floor(box.y + scrolled.y - margin)),
        width: Math.ceil(box.width + 2 * margin),
        height: Math.ceil(box.height + 2 * margin),
      },
    }),
  });
  console.log(`  ${name}.png`);
}

/** Calls core as admin does, from the admin page the owner has open. */
async function callCore(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
) {
  const answer = await page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { status: res.status, text: await res.text() };
    },
    { url: `${origin("core")}${path}`, method, body },
  );
  if (answer.status >= 300) {
    throw new Error(
      `${method} ${path} answered ${String(answer.status)}: ${answer.text}`,
    );
  }
  const parsed: unknown = JSON.parse(answer.text);
  return parsed;
}

/** `value` as an object, or an error naming `what` it should be. */
function objectOf(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Core's ${what} isn't an object.`);
  return value;
}

/** `value`'s `key`, which must be text. */
function textOf(value: Record<string, unknown>, key: string): string {
  const text = value[key];
  if (typeof text !== "string") {
    throw new Error(`Core's answer has no ${key} as text.`);
  }
  return text;
}

/** Mints each guest's code, and gives each role its guests. */
async function makeGuests(admin: Page) {
  const ids = new Map<string, string>();
  for (const { name, code } of guests) {
    const minted = await callCore(admin, "POST", "/codes", { name, code });
    ids.set(name, textOf(objectOf(minted, "new code"), "id"));
  }
  const { roles } = objectOf(await callCore(admin, "GET", "/roles"), "roles");
  if (!Array.isArray(roles)) {
    throw new Error(
      `GET /roles answered no list of roles: ${JSON.stringify(roles)}`,
    );
  }
  for (const value of roles) {
    const role = objectOf(value, "role");
    const roleName = textOf(role, "name");
    const codeIds = guests
      .filter((guest) => guest.roles.some((held) => held === roleName))
      .map(({ name }) => ids.get(name));
    await callCore(admin, "POST", `/roles/${textOf(role, "id")}/codes`, {
      codeIds,
    });
  }
}

async function takeScreenshots(running: Running) {
  await rm(shotsDir, { recursive: true, force: true });
  await mkdir(shotsDir, { recursive: true });
  const browser = await launch();
  /** A new page in a window of its own, patient with a busy machine. */
  const newPage = async () => {
    const opened = await (await browser.newContext(view)).newPage();
    opened.setDefaultTimeout(pageTimeout);
    return opened;
  };
  const view = {
    viewport: small,
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  } as const;
  try {
    const page = await newPage();

    await page.goto(origin("hub"));
    await page.getByRole("heading", { name: "Set up this install" }).waitFor();
    await shoot(page, "hub-set-up");
    await page.getByLabel("Username").fill(owner.username);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByLabel("Confirm password").fill(owner.password);
    await page.getByRole("button", { name: "Create owner" }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor();
    await page.getByText("Loading apps…").waitFor({ state: "detached" });
    await shoot(page, "hub-first-launcher");

    console.log("  Adding the other apps with robkit add…");
    await addApps(running);

    await page.setViewportSize(wide);
    await page.goto(origin("admin"));
    // Admin may ask the owner to sign in again on its own subdomain.
    const signIn = page.getByRole("button", { name: "I'm the owner" });
    const codes = page.getByRole("heading", { name: "Access codes" });
    await codes.or(signIn).waitFor();
    if (await signIn.isVisible()) {
      await signIn.click();
      await page.getByLabel("Username").fill(owner.username);
      await page.getByLabel("Password").fill(owner.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await codes.waitFor();
    }
    await makeGuests(page);
    await page.reload();
    const section = (heading: string) =>
      page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 1,
          name: heading,
          exact: true,
        }),
      });
    await section("Roles").getByRole("listitem").first().waitFor();
    await shoot(page, "admin-codes", section("Access codes"));
    await shoot(page, "admin-roles", section("Roles"));

    await page.setViewportSize(small);
    await page.goto(origin("hub"));
    await page.getByText("Loading apps…").waitFor({ state: "detached" });
    await shoot(page, "hub-launcher");

    await page.goto(origin(exampleSlug));
    await page.getByTestId("viewer-id").waitFor();
    // The owner's id is new in each install, so it's covered.
    await shoot(page, "app", undefined, [page.getByTestId("viewer-id")]);

    const guest = await newPage();
    await guest.goto(origin("hub"));
    await guest.getByLabel("Access code").waitFor();
    await shoot(guest, "hub-sign-in");
  } finally {
    await browser.close();
  }
}

/**
 * The commit the screenshots come from, marked when files had changed. The
 * screenshots' own folder doesn't count, so a second run reads the same.
 */
async function commit(): Promise<string> {
  const { stdout: head } = await run("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
  });
  const { stdout: changed } = await run(
    "git",
    ["status", "--porcelain", "--", ".", ":!site/src/screenshots"],
    { cwd: repoRoot },
  );
  return `${head.trim()}${changed.trim() === "" ? "" : " with changes not committed"}`;
}

// Read first: the screenshots change the checkout's files.
const from = await commit();
console.log("Making an install and starting pnpm dev in it…");
const started = await startInstall();
try {
  console.log(`Taking the screenshots into ${shotsDir}:`);
  await takeScreenshots(started);
} finally {
  await stopInstall(started);
}
await writeFile(
  join(shotsDir, "record.json"),
  `${JSON.stringify({ commit: from, command }, undefined, 2)}\n`,
);
console.log("Done. record.json names the commit and the command.");
