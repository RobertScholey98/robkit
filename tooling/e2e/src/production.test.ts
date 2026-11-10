import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { defaultChoices, init, readyStacks } from "create-robkit";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { removeWhenGone } from "@internal/test-postgres";
import type { Slug } from "@robkit/input";
import { takeBrowserLog } from "./browser.ts";
import {
  guestOpens,
  ownerSetsUp,
  testCodeAnswer,
  type OwnerSetUp,
} from "./production-journey.ts";
import { buildApp, hostEnv, startApp } from "./production-apps.ts";
import {
  answerOf,
  appFolderFiles,
  answers,
  extraneousPackages,
  imagePackages,
  robkitPackages,
  stackReport,
  stopApp,
  withVisitors,
} from "./production-checks.ts";
import { startStack, stopStack, type Stack } from "./production-stack.ts";
import { exampleSlug } from "./install.ts";
import { slug } from "@internal/test-session";

const run = promisify(execFile);

/**
 * The apps the owner adds with robkit add after the first deploy: one on
 * each stack but the example's, named after its stack.
 */
const later = readyStacks
  .filter((stack) => stack !== defaultChoices.exampleStack)
  .map((stack) => ({ stack, slug: slug(stack.replaceAll("-", "")) }));

/** Builds each app's image and starts its container with its env. */
async function deployApps(stack: Stack, slugs: Slug[]): Promise<void> {
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

// The default install, deployed as on Coolify: an image per app from its
// Dockerfile, core first, every app behind TLS on its own subdomain of a
// domain that isn't localhost. Opt in with pnpm test:production.
//
// No container starts or stops while a browser is open. On a host whose
// Docker networks are its own, as on GitHub's runners, each one changes
// the host's interfaces, and Chromium fails in-flight requests with
// ERR_NETWORK_CHANGED. So every deploy below finishes before the journey
// after it launches a browser, each launch waits for the host's interfaces
// to settle, and each journey closes its browser.
describe("the default install in production", () => {
  let dir: string;
  let stack: Stack;
  let setUp: OwnerSetUp;

  /**
   * The cookies a guest holds once `app` opens, as the journey lists them:
   * core's session and the app's session and state, each host-only under
   * its __Host- name.
   */
  const hostCookies = (app: Slug): string[] => {
    const host = (name: Slug) => new URL(stack.addresses.origin(name)).hostname;
    const attributes = "Path=/ Secure HttpOnly Lax";
    return [
      `${host(slug("core"))} __Host-robkit_session ${attributes}`,
      `${host(app)} __Host-robkit_session ${attributes}`,
      `${host(app)} __Host-robkit_state ${attributes}`,
    ].sort();
  };

  /**
   * What an app's page and core's /refresh tell the browser over https:
   * HSTS on both, nosniff on both, and the guard's framing header on the
   * page alone, since a redirect renders nothing.
   */
  const overHttps = {
    app: { frame: "SAMEORIGIN", sniff: "nosniff", hsts: "max-age=31536000" },
    refresh: { frame: null, sniff: "nosniff", hsts: "max-age=31536000" },
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "robkit-production-"));
    removeWhenGone({ path: dir });
    await init(defaultChoices, dir, { link: true, install: true });
    // The example's own settings, as its author keeps them for pnpm dev.
    for (const name of [".env", ".env.local", ".env.example"]) {
      await writeFile(
        join(dir, "apps", exampleSlug, name),
        "EXAMPLE_SECRET=only on this machine\n",
      );
    }
    // A host can't reach this checkout, so the install takes tarballs.
    await run("pnpm", ["run", "robkit", "vendor"], {
      cwd: dir,
    });
    stack = await startStack(dir, [
      "core",
      "hub",
      "admin",
      "example",
      ...later.map((app) => app.slug),
    ]);
    await deployApps(stack, ["core"]);
    await answers(stack, "core", 200, "/status");
    await deployApps(stack, ["hub", "admin"]);
    await answers(stack, "hub", 200);
    // The owner opens the example to anyone before it starts, so its guard
    // never keeps the owner-only rule it would start with.
    setUp = await ownerSetsUp(stack.addresses, exampleSlug).catch(
      async (error: unknown) => {
        console.error(await whatWentWrong(stack));
        throw error;
      },
    );
    await deployApps(stack, [exampleSlug]);
    await answers(stack, exampleSlug, 200);
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

  it("lets a guest sign in with the owner's code and open the app over https, in __Host- cookies", async () => {
    const visit = await guestOpens(
      stack.addresses,
      setUp.code ?? "",
      exampleSlug,
    );

    expect(visit).toEqual({
      greeting: "Signed in as Grandma",
      openedAt: `${stack.addresses.origin(exampleSlug)}/`,
      heading: "Signed in as a guest",
      stylesheets: [200],
      cookies: hostCookies(exampleSlug),
      headers: overHttps,
    });
  });

  it.each(["core", "hub", "admin", "example"])(
    "builds %s's image with no package production doesn't need",
    async (name) => {
      expect(await extraneousPackages(stack, slug(name))).toEqual([]);
    },
  );

  it("leaves an app's .env files out of its image, and keeps .env.example", async () => {
    const files = await appFolderFiles(stack, exampleSlug);

    expect(files.filter((name) => name.startsWith(".env"))).toEqual([
      ".env.example",
    ]);
  });

  // Core's manifest doesn't name @robkit/provision: it arrives behind
  // core, from the tarball robkit vendor packed, not from npm.
  // @robkit/drizzle arrives the same way, and the apps name it too.
  // @robkit/serve arrives behind core as well.
  it("puts core's robkit packages in its image, and not the dev runner", async () => {
    expect(await robkitPackages(stack, slug("core"))).toEqual([
      "@robkit/core",
      "@robkit/drizzle",
      "@robkit/guard",
      "@robkit/input",
      "@robkit/provision",
      "@robkit/serve",
      "@robkit/session",
    ]);
  });

  // The hub is a built page, served by servePage(), so its image holds
  // @robkit/serve and the input it reads, and nothing from the guard.
  it("puts @robkit/serve and what it runs on in the hub's image", async () => {
    expect(await robkitPackages(stack, slug("hub"))).toEqual([
      "@robkit/input",
      "@robkit/serve",
    ]);
  });

  // No page can frame the hub, which takes the owner's password.
  it("sends the hub's page with headers that refuse every framer, over https", async () => {
    const { headers } = await answerOf(stack, slug("hub"));

    expect({
      frame: headers["x-frame-options"],
      policy: headers["content-security-policy"],
      sniff: headers["x-content-type-options"],
      hsts: headers["strict-transport-security"],
    }).toEqual({
      frame: "DENY",
      policy: "frame-ancestors 'none'",
      sniff: "nosniff",
      hsts: "max-age=31536000",
    });
  });

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

  it("serves an app on each other stack, added with robkit add, after its next deploy, in __Host- cookies", async () => {
    for (const app of later) {
      await run(
        "pnpm",
        [
          "run",
          "robkit",
          "add",
          app.slug,
          "--stack",
          app.stack,
          "--access",
          "open",
        ],
        { cwd: dir },
      );
    }
    // The next deploy: core picks up the new apps and provisions their
    // databases, then each app's own container starts.
    await deployApps(stack, ["core"]);
    await answers(stack, "core", 200, "/status");
    await deployApps(
      stack,
      later.map((app) => app.slug),
    );
    const visits: Record<string, unknown> = {};
    for (const app of later) {
      await answers(stack, app.slug, 200);
      visits[app.stack] = await guestOpens(
        stack.addresses,
        setUp.code ?? "",
        app.slug,
      );
    }

    expect(visits).toEqual(
      Object.fromEntries(
        later.map((app) => [
          app.stack,
          {
            greeting: "Signed in as Grandma",
            openedAt: `${stack.addresses.origin(app.slug)}/`,
            heading: "Signed in as a guest",
            stylesheets: [200],
            cookies: hostCookies(app.slug),
            headers: overHttps,
          },
        ]),
      ),
    );
    // It builds four images, which takes 215 to 245 seconds on a usual CI
    // runner and over 300 on a slow one. So it gets the hooks' limit.
  }, 900_000);

  it.each(later)(
    "builds the $stack app's image with no package production doesn't need",
    async (app) => {
      expect(await extraneousPackages(stack, app.slug)).toEqual([]);
    },
  );

  // The extra-packages check counts a peer as needed, so it can't see a
  // build tool that arrives as one. These two would get Vite that way.
  it.each(["hub", "express"])(
    "builds %s's image without vite",
    async (name) => {
      expect(await imagePackages(stack, slug(name))).not.toContain("vite");
    },
  );

  // Next loads next.config.ts, and withRobkit() from @robkit/next/config,
  // as its server starts, so the Next app's image holds @robkit/next and
  // the robkit packages it runs on.
  it("puts @robkit/next and what it runs on in the Next app's image", async () => {
    expect(await robkitPackages(stack, slug("next"))).toEqual([
      "@robkit/drizzle",
      "@robkit/guard",
      "@robkit/input",
      "@robkit/next",
      "@robkit/serve",
      "@robkit/session",
    ]);
  });

  // Last, since they stop what the tests above use. The exit code is the
  // server's own: Docker's signal reached it, and it stopped before
  // Docker's kill, which would have made it 137.
  it("stops core's container with code 0 on docker stop, once core has stopped", async () => {
    expect(await stopApp(stack, slug("core"))).toEqual({
      exitCode: 0,
      lastLine: "core stopped",
    });
  });

  it.each([
    { name: "hub", line: "hub stopped" },
    { name: "admin", line: "admin stopped" },
    ...[exampleSlug, ...later.map((app) => app.slug)]
      .filter((name) => name !== slug("go"))
      .map((name) => ({ name, line: "server stopped" })),
  ])(
    "stops $name's container with code 0 on docker stop, once its server has stopped",
    async ({ name, line }) => {
      expect(await stopApp(stack, slug(name))).toEqual({
        exitCode: 0,
        lastLine: line,
      });
    },
  );

  it("stops a Go app's container with code 0 on docker stop", async () => {
    const go = later.find((app) => app.stack === "go");

    expect((await stopApp(stack, go?.slug ?? slug("go"))).exitCode).toBe(0);
  });
});
