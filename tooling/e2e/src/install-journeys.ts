import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { discoverApps } from "@robkit/dev";
import { describe, expect, it } from "vitest";
import { testA11yJourney } from "./a11y-journey.ts";
import { testAddedAppJourney } from "./added-app-journey.ts";
import { testCrossOriginJourney, type Posts } from "./cross-origin-journey.ts";
import { letTheHubFrameNext, testFramingJourneys } from "./framing-journey.ts";
import { interrupt, owner, useDevStack } from "./dev-stack.ts";
import { testGuestJourney } from "./guest-journey.ts";
import {
  addedIcon,
  addedSlug,
  addedStackFor,
  exampleSlug,
  installChoices,
  type InstallName,
} from "./install.ts";
import {
  testClientNavigationJourney,
  testServerActionJourney,
} from "./lapsed-call-journeys.ts";
import { testOwnerJourney } from "./owner-journey.ts";
import { testRoleJourney } from "./role-journey.ts";
import { testServerFunctionJourney } from "./server-function-journey.ts";
import { testThemeJourney } from "./theme-journey.ts";

const run = promisify(execFile);

/**
 * Commits the install in `dir` as it stands, so git can say what `pnpm dev`
 * changes. CI's runner has no name or email in git, and init made no first
 * commit there.
 */
async function commitAll(dir: string): Promise<void> {
  const git = (...args: string[]) =>
    run(
      "git",
      [
        "-c",
        "user.name=robkit",
        "-c",
        "user.email=robkit@example.com",
        ...args,
      ],
      { cwd: dir },
    );
  await git("add", "--all");
  // Without the install's hook, as init's first commit is.
  await git("commit", "--quiet", "--no-verify", "--allow-empty", "-m", "Start");
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

export interface JourneyOptions {
  /**
   * Whether to run the role journey, which waits out the app's cached rule
   * twice and takes nearly two minutes. It tests core and the guard, which
   * every install shares.
   */
  roles?: boolean;
  /**
   * Whether the example calls its server from its page with sessionFetch, as
   * Start's server function and the Go example's API do, so the server
   * function journey runs. A stack's own test file says.
   */
  serverFunction?: boolean;
  /**
   * Whether a lapsed session on a client navigation and on a server action
   * gets journeys of its own, as Next's example has both.
   */
  lapsedCalls?: boolean;
  /**
   * How the example's page posts to its server: `fetch` from a script, as
   * Go's, Next's and Start's do, or `form`, as React + Hono's and
   * Express's do. A sibling app's page posts the same and is refused.
   */
  posts?: Posts;
  /**
   * Whether the example's server passes Vite's hot-update socket through
   * the guard under pnpm dev, as Go's does.
   */
  viteSocket?: boolean;
  /**
   * Whether the example lets the hub frame a page and has route handlers
   * that send their own framing headers, which the test adds to Next's
   * before `pnpm dev` starts, so its framing journeys run.
   */
  hubFrames?: boolean;
}

/**
 * Runs `pnpm dev` in the install `name`, and takes the owner and guests
 * through it in a browser.
 *
 * Each journey waits for the stack and claims the install if nothing has,
 * so `vitest -t "<journey>"` runs any one alone. The claim test needs the
 * install unclaimed, so it comes before every journey, and Ctrl-C's comes
 * last, since it stops the stack.
 */
export function describeJourneys(
  name: InstallName,
  {
    roles = true,
    serverFunction = false,
    lapsedCalls = false,
    posts = "fetch",
    viteSocket = false,
    hubFrames = false,
  }: JourneyOptions = {},
): void {
  const stack = installChoices[name].exampleStack;
  const dev = useDevStack(name, async (dir) => {
    if (hubFrames) await letTheHubFrameNext(dir);
    await commitAll(dir);
  });

  describe(`pnpm dev in an install with the ${stack} example`, () => {
    it("changes no file git tracks, and adds none git would", async () => {
      expect(await dev.changedByDev()).toBe("");
    });

    it("serves the hub on hub.robkit.localhost", async () => {
      const hub = await dev.eventually(() => dev.send(dev.hostOf("hub"), "/"));

      expect(hub.headers["content-type"]).toMatch(/text\/html/);
      expect(hub.body).toContain('<div id="root">');
      // The hub has no guard, so robkit({ guarded: false }) sends core's
      // three headers from its dev server: nobody may frame it.
      expect({
        frame: hub.headers["x-frame-options"],
        policy: hub.headers["content-security-policy"],
        sniff: hub.headers["x-content-type-options"],
      }).toEqual({
        frame: "DENY",
        policy: "frame-ancestors 'none'",
        sniff: "nosniff",
      });
    });

    it("serves core on core.robkit.localhost, open to the hub", async () => {
      const hubOrigin = dev.addresses().origin("hub");

      const status = await dev.eventually(() =>
        dev.send(dev.hostOf("core"), "/status", {
          headers: { origin: hubOrigin },
        }),
      );

      expect(JSON.parse(status.body)).toEqual({ status: "ok" });
      expect(status.headers["access-control-allow-origin"]).toBe(hubOrigin);
    });

    it("lets the owner claim the install and stay signed in", async () => {
      await dev.started();
      const core = dev.hostOf("core");
      const origin = dev.addresses().origin("hub");

      const before = await dev.send(core, "/session", { headers: { origin } });
      const setup = await dev.send(core, "/setup", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(owner),
      });
      const [cookie = ""] = setup.headers["set-cookie"] ?? [];
      const after = await dev.send(core, "/session", {
        headers: { origin, cookie: cookie.split(";")[0] ?? "" },
      });

      expect(JSON.parse(before.body)).toEqual({ state: "unclaimed" });
      expect(setup.status).toBe(201);
      expect(cookie).toMatch(/^robkit_session=[\w-]+\.[\w-]+\.[\w-]+;/);
      expect(cookie).not.toContain("Domain=");
      expect(cookie).not.toContain("Secure");
      const signedIn: unknown = JSON.parse(setup.body);
      expect(signedIn).toMatchObject({
        state: "signed-in",
        profile: { kind: "owner", username: owner.username },
      });
      // The session core reads back is the one setup started.
      expect(JSON.parse(after.body)).toEqual(signedIn);
    });

    it("starts the app robkit add makes, and keeps a guest signed in", async () => {
      await dev.claimedBeforeAdd();
      const core = dev.hostOf("core");
      const origin = dev.addresses().origin("hub");
      const signIn = await dev.send(core, "/login/code", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ code: "test" }),
      });
      const [cookie = ""] = signIn.headers["set-cookie"] ?? [];
      const asGuest = {
        headers: { origin, cookie: cookie.split(";")[0] ?? "" },
      };
      const launcher = async (): Promise<unknown> =>
        JSON.parse((await dev.send(core, "/launcher", asGuest)).body);
      const session = async (): Promise<unknown> =>
        JSON.parse((await dev.send(core, "/session", asGuest)).body);
      const before = {
        session: await session(),
        launcher: await launcher(),
      };

      // The example keeps answering while robkit add installs and pnpm dev
      // starts the new app and restarts core.
      const adding = dev.added();
      const finished = adding.then(
        () => true,
        () => true,
      );
      const exampleAnswered = new Set<number>();
      do {
        const reply = await dev.send(dev.hostOf(exampleSlug), "/");
        exampleAnswered.add(reply.status);
      } while (!(await Promise.race([finished, delay(250, false)])));
      const printed = await adding;

      expect(printed).toContain(
        `Added apps/${addedSlug}. pnpm dev started ${addedSlug} at ${dev.addresses().origin(addedSlug)}.`,
      );
      // Signed out, the example answers 401 every time. Its guard may
      // answer 503 when a loaded machine slows core past its wait;
      // requests.db.test.ts in @robkit/dev shows core answering throughout.
      // Anything else, such as the proxy's 502, is the example gone.
      expect(exampleAnswered).toContain(401);
      expect(
        [...exampleAnswered].filter((status) => ![401, 503].includes(status)),
      ).toEqual([]);
      // The example is the owner's alone, so the guest's launcher was empty.
      expect({
        session: before.session,
        launcher: before.launcher,
      }).toMatchObject({
        session: { state: "signed-in", profile: { kind: "guest" } },
        launcher: { apps: [] },
      });
      // Core restarted with the longer list, and the guest's session lived
      // through it.
      expect({
        session: await session(),
        launcher: await launcher(),
      }).toMatchObject({
        session: before.session,
        launcher: { apps: [{ slug: addedSlug, icon: addedIcon }] },
      });
      // The proxy still reaches every app on the port it had.
      expect({
        hub: (await dev.send(dev.hostOf("hub"), "/")).status,
        core: (await dev.send(core, "/status")).status,
        admin: (await dev.send(dev.hostOf("admin"), "/")).status,
        example: (await dev.send(dev.hostOf(exampleSlug), "/")).status,
        added: (await dev.send(dev.hostOf(addedSlug), "/")).status,
      }).toEqual({ hub: 200, core: 200, admin: 401, example: 401, added: 200 });
    });

    // After the journey above, which signs a guest in before the add.
    it.runIf(addedStackFor(stack) === "start")(
      "leaves the route tree robkit add wrote as TanStack Router has it",
      async () => {
        await dev.up();
        const routeTree = "src/routeTree.gen.ts";

        const kept = await readFile(
          join(dev.dir, "apps", addedSlug, routeTree),
          "utf8",
        );

        const written = await readFile(
          new URL(
            `../../../packages/create-robkit/templates/stacks/start/${routeTree}`,
            import.meta.url,
          ),
          "utf8",
        );
        expect(kept).toBe(written);
      },
    );

    testOwnerJourney(dev);
    testServerFunctionJourney(dev, serverFunction);
    testClientNavigationJourney(dev, lapsedCalls);
    testServerActionJourney(dev, lapsedCalls);
    testCrossOriginJourney(dev, { posts, viteSocket });
    testFramingJourneys(dev, { hubFrames });
    testGuestJourney(dev);
    testAddedAppJourney(dev);
    testThemeJourney(dev);
    testA11yJourney(dev, name);
    testRoleJourney(dev, roles);

    it("stops every app and Postgres on Ctrl-C", async () => {
      await dev.up();
      const apps = await discoverApps(dev.dir, dev.port() + 1);

      const code = await interrupt(dev);

      expect(code).toBe(0);
      for (const port of [dev.port(), ...apps.map((app) => app.port)]) {
        expect(await isListening(port)).toBe(false);
      }
      const running = await run(
        "docker",
        ["compose", "-p", dev.project, "ps", "-q"],
        { cwd: dev.dir },
      );
      expect(running.stdout.trim()).toBe("");
    });
  });
}
