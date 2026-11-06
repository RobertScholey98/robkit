import { execFile } from "node:child_process";
import { connect } from "node:net";
import { promisify } from "node:util";
import { discoverApps } from "@robkit/dev";
import { describe, expect, it } from "vitest";
import { testA11yJourney } from "./a11y-journey.ts";
import { testAddedAppJourney } from "./added-app-journey.ts";
import { interrupt, owner, useDevStack } from "./dev-stack.ts";
import { testGuestJourney } from "./guest-journey.ts";
import { installChoices, type InstallName } from "./install.ts";
import { testOwnerJourney } from "./owner-journey.ts";
import { testRoleJourney } from "./role-journey.ts";
import { testServerFunctionJourney } from "./server-function-journey.ts";
import { testThemeJourney } from "./theme-journey.ts";

const run = promisify(execFile);

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
}

/**
 * Runs `pnpm dev` in the install `name`, and takes the owner and guests
 * through it in a browser.
 */
export function describeJourneys(
  name: InstallName,
  { roles = true }: JourneyOptions = {},
): void {
  const stack = installChoices[name].exampleStack;
  const dev = useDevStack(name);

  describe(`pnpm dev in an install with the ${stack} example`, () => {
    it("serves the hub on hub.robkit.localhost", async () => {
      const hub = await dev.eventually(() => dev.send(dev.hostOf("hub"), "/"));

      expect(hub.headers["content-type"]).toMatch(/text\/html/);
      expect(hub.body).toContain('<div id="root">');
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

    testOwnerJourney(dev);
    testServerFunctionJourney(dev, stack === "start");
    testGuestJourney(dev);
    testAddedAppJourney(dev);
    testThemeJourney(dev);
    testA11yJourney(dev, name);
    testRoleJourney(dev, roles);

    // Last, since it stops the stack.

    it("stops every app and Postgres on Ctrl-C", async () => {
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
