import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { defaultChoices, init, type Choices } from "create-robkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  guestOpens,
  ownerSetsUp,
  testCodeAnswer,
  type OwnerSetUp,
} from "./production-journey.ts";
import {
  answers,
  buildApp,
  hostEnv,
  startApp,
  startStack,
  stopStack,
  type Stack,
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

const installs: [string, Choices][] = [
  ["default", defaultChoices],
  // Each ORM migrates as its app's container starts.
  ["Prisma", { ...defaultChoices, orm: "prisma" }],
  ["Kysely", { ...defaultChoices, orm: "kysely" }],
];

// Each install, deployed as on Coolify: an image per app from its
// Dockerfile, core first, every app behind TLS on its own subdomain of a
// domain that isn't localhost. Opt in with pnpm test:production.
describe.each(installs)("the %s install in production", (_, choices) => {
  let dir: string;
  let stack: Stack;
  let setUp: OwnerSetUp;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "robkit-production-"));
    await init(choices, dir, { link: true, install: true });
    // A host can't reach this checkout, so the install takes tarballs.
    await run("pnpm", ["robkit", "vendor"], { cwd: dir });
    stack = await startStack(dir, ["core", "hub", "admin", "example", later]);
    await deployApps(stack, ["core"]);
    await answers(stack, "core", 200, "/status");
    await deployApps(stack, ["hub", "admin"]);
    await answers(stack, "hub", 200);
    // The owner opens the example to anyone before it starts, so its guard
    // never keeps the owner-only rule it would start with.
    setUp = await ownerSetsUp(stack.addresses, "example");
    await deployApps(stack, ["example"]);
    await answers(stack, "example", 200);
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
    });
  });

  it("refuses the test code", async () => {
    expect(await testCodeAnswer(stack.addresses)).toBe(
      "That code doesn't work.",
    );
  });

  it("serves an app added with robkit add after its next deploy", async () => {
    await run(
      "pnpm",
      ["robkit", "add", later, "--stack", "react-hono", "--access", "open"],
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
    });
  });
});
