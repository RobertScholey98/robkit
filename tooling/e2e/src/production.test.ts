import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { defaultChoices, init, type Choices } from "create-robkit";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { takeBrowserLog } from "./browser.ts";
import {
  guestOpens,
  ownerSetsUp,
  testCodeAnswer,
  type OwnerSetUp,
} from "./production-journey.ts";
import {
  answers,
  buildApp,
  extraneousPackages,
  hostEnv,
  stackReport,
  startApp,
  startStack,
  stopStack,
  type Stack,
  withVisitors,
} from "./production-stack.ts";

const run = promisify(execFile);

/** The app the owner adds with robkit add after the first deploy. */
const later = "later";

/** Builds each app's image and starts its container with its env. */
async function deployApps(stack: Stack, slugs: string[]): Promise<void> {
  await Promise.all(slugs.map((slug) => buildApp(stack, slug)));
  const env = await hostEnv(stack);
  for (const slug of slugs) {
    await startApp(stack, slug, env.get(slug) ?? {});
  }
}

/** What the browser saw, then each container's state and its last logs. */
async function whatWentWrong(stack: Stack): Promise<string> {
  return `What the browser saw:\n${takeBrowserLog()}\n\nThe stack's containers:\n${await stackReport(stack)}`;
}

/** Each install by the key `E2E_PRODUCTION_INSTALL` picks it by. */
const installs: [string, Choices][] = [
  ["default", defaultChoices],
  // Each ORM migrates as its app's container starts, and each UI kit's apps
  // serve its stylesheet. The two shadcn kits share their apps' layer, so
  // Base UI stands for both, and Chakra's server-rendered styles get a run.
  ["prisma", { ...defaultChoices, orm: "prisma", uiKit: "chakra" }],
  ["kysely", { ...defaultChoices, orm: "kysely", uiKit: "shadcn-base-ui" }],
];

/**
 * The installs this run deploys: every one, or the one
 * `E2E_PRODUCTION_INSTALL` names, as each CI job runs one.
 */
function chosen(): [string, Choices][] {
  const key = process.env.E2E_PRODUCTION_INSTALL;
  if (!key) return installs;
  const picked = installs.filter(([name]) => name === key);
  if (picked.length === 0) {
    throw new Error(
      `E2E_PRODUCTION_INSTALL is ${key}, not one of ${installs.map(([name]) => name).join(", ")}`,
    );
  }
  return picked;
}

// Each install, deployed as on Coolify: an image per app from its
// Dockerfile, core first, every app behind TLS on its own subdomain of a
// domain that isn't localhost. Opt in with pnpm test:production.
//
// No container starts or stops while a browser is open. On a host whose
// Docker networks are its own, as on GitHub's runners, each one changes
// the host's interfaces, and Chromium fails in-flight requests with
// ERR_NETWORK_CHANGED. So every deploy below finishes before the journey
// after it launches a browser, each launch waits for the host's interfaces
// to settle, and each journey closes its browser.
describe.each(chosen())("the %s install in production", (key, choices) => {
  let dir: string;
  let stack: Stack;
  let setUp: OwnerSetUp;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "robkit-production-"));
    await init(choices, dir, { link: true, install: true });
    // A host can't reach this checkout, so the install takes tarballs.
    await run("pnpm", ["run", "robkit", "vendor"], {
      cwd: dir,
    });
    stack = await startStack(
      dir,
      ["core", "hub", "admin", "example", later],
      key,
    );
    await deployApps(stack, ["core"]);
    await answers(stack, "core", 200, "/status");
    await deployApps(stack, ["hub", "admin"]);
    await answers(stack, "hub", 200);
    // The owner opens the example to anyone before it starts, so its guard
    // never keeps the owner-only rule it would start with.
    setUp = await ownerSetsUp(stack.addresses, "example").catch(
      async (error: unknown) => {
        console.error(await whatWentWrong(stack));
        throw error;
      },
    );
    await deployApps(stack, ["example"]);
    await answers(stack, "example", 200);
  });

  // A journey that times out says only what it waited for.
  beforeEach(({ onTestFailed }) => {
    takeBrowserLog();
    onTestFailed(async () => {
      console.error(await whatWentWrong(stack));
    });
  });

  afterAll(async () => {
    await stopStack();
    await rm(dir, { recursive: true, force: true });
  });

  it("lets the owner claim the fresh install on the first visit, once", () => {
    expect(setUp).toEqual({
      firstVisit: "Set up this install",
      setupAfterClaim: false,
      code: expect.stringMatching(/^[A-Z2-9]{5}$/) as string,
    });
  });

  it("lets a guest sign in with the owner's code and open the app over https", async () => {
    const visit = await guestOpens(
      stack.addresses,
      setUp.code ?? "",
      "example",
    );

    expect(visit).toEqual({
      greeting: "Signed in as Grandma",
      openedAt: `${stack.addresses.origin("example")}/`,
      heading: "Signed in as a guest",
      stylesheets: choices.uiKit ? [200] : [],
    });
  });

  it.each(["core", "hub", "admin", "example"])(
    "builds %s's image with no package production doesn't need",
    async (slug) => {
      expect(await extraneousPackages(stack, slug)).toEqual([]);
    },
  );

  it("refuses the test code", async () => {
    expect(await testCodeAnswer(stack.addresses)).toBe(
      "That code doesn't work.",
    );
  });

  it("counts each visitor's failed sign-ins on their own behind the tunnel, whatever headers they send", async () => {
    // The first visitor forges a fresh address on every attempt, in both
    // headers a proxy might trust. Cloudflare replaces its own header, and
    // core reads nothing else, so all six count against the one visitor.
    const forged = Array.from({ length: 6 }, (_, i) => ({
      password: "not the password",
      headers: {
        "cf-connecting-ip": `198.51.100.${String(i + 1)}`,
        "x-forwarded-for": `198.51.100.${String(i + 1)}`,
      },
    }));
    const { first, second } = await withVisitors(
      stack,
      2,
      async ([one, two]) => ({
        first: await one?.signsIn(forged),
        second: await two?.signsIn([{ password: "not the password" }]),
      }),
    );

    expect({ first, second }).toEqual({
      first: [401, 401, 401, 401, 401, 429],
      second: [401],
    });
  });

  it("serves an app added with robkit add after its next deploy", async () => {
    await run(
      "pnpm",
      [
        "run",
        "robkit",
        "add",
        later,
        "--stack",
        "react-hono",
        "--access",
        "open",
      ],
      { cwd: dir },
    );
    // The next deploy: core picks up the new app and provisions its
    // database, then the app's own container starts.
    await deployApps(stack, ["core"]);
    await answers(stack, "core", 200, "/status");
    await deployApps(stack, [later]);
    await answers(stack, later, 200);

    const visit = await guestOpens(stack.addresses, setUp.code ?? "", later);

    expect(visit).toEqual({
      greeting: "Signed in as Grandma",
      openedAt: `${stack.addresses.origin(later)}/`,
      heading: "Signed in as a guest",
      stylesheets: choices.uiKit ? [200] : [],
    });
  });
});
