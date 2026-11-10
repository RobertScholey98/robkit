import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { expect, it } from "vitest";
import { handedBack, refreshing } from "./bounces.ts";
import { launch } from "./browser.ts";
import { ownerCookie } from "./cross-origin-journey.ts";
import type { DevStack } from "./dev-stack.ts";
import { addedSlug, exampleSlug } from "./install.ts";
import { openSignedIn } from "./lapsed-call-journeys.ts";
import {
  expiredTwin,
  sessionCookieFor,
  type JourneyOptions,
} from "./owner-journey.ts";

// A sibling app is same-site, so a page of its own that frames admin or
// another app would carry the viewer's cookies. The guard's
// X-Frame-Options: SAMEORIGIN makes the browser refuse the frame. An app
// lets a framer in with its own frame-ancestors, which a browser obeys
// over X-Frame-Options.

/** What a page that put `src` in a frame got, and whether it showed. */
export interface Framed {
  /** The status of the page the frame ended on. */
  status: number;
  xFrameOptions: string | null;
  /** Whether the browser showed it, rather than its error page. */
  shown: boolean;
}

/**
 * Puts `src` in a frame on `page`, and waits for the frame to finish. The
 * frame goes through the guard's and core's redirects first when the app
 * holds no token for the viewer.
 */
async function frame(page: Page, src: string): Promise<Framed> {
  const arrived = page.waitForResponse(
    (res) =>
      res.url() === src &&
      res.status() === 200 &&
      res.frame() !== page.mainFrame(),
  );
  await page.evaluate(
    (url) =>
      new Promise<void>((resolve) => {
        const element = document.createElement("iframe");
        element.src = url;
        element.addEventListener("load", () => {
          resolve();
        });
        document.body.append(element);
      }),
    src,
  );
  const res = await arrived;
  // Chromium shows its own error page in a frame it refuses.
  const shown = page
    .frames()
    .some((one) => one !== page.mainFrame() && one.url() === src);
  return {
    status: res.status(),
    xFrameOptions: await res.headerValue("x-frame-options"),
    shown,
  };
}

/**
 * The owner signs in to the example, then opens a page on the added app
 * that frames admin and the example.
 */
export async function siblingFramesJourney(
  options: JourneyOptions,
): Promise<{ admin: Framed; example: Framed }> {
  const browser = await launch();
  try {
    const context = await browser.newContext();
    await openSignedIn(context, options);
    const sibling = await context.newPage();
    await sibling.goto(`${options.install.origin(addedSlug)}/`);

    return {
      admin: await frame(sibling, `${options.install.origin("admin")}/`),
      example: await frame(sibling, `${options.install.origin(exampleSlug)}/`),
    };
  } finally {
    await browser.close();
  }
}

/** The policy that lets the hub frame a page of the example. */
export const hubMayFrame = (dev: DevStack) =>
  `frame-ancestors 'self' ${dev.addresses().origin("hub")}`;

/**
 * Lets the hub frame the Next example's `/visits`, through `headers()` in
 * `next.config.ts`, and adds two route handlers: one that sends its own
 * X-Frame-Options, and one that sends its own frame-ancestors. For before
 * `pnpm dev` starts, since Next restarts when its config changes.
 */
export async function letTheHubFrameNext(dir: string): Promise<void> {
  const app = join(dir, "apps", exampleSlug);
  const config = join(app, "next.config.ts");
  const before = await readFile(config, "utf8");
  const policy =
    'frame-ancestors \'self\' ${String(process.env.ROBKIT_CORE_URL).replace("//core.", "//hub.")}';
  const after = before.replace(
    "    agentRules: false,\n",
    `    agentRules: false,
    // The whole-stack test's: the hub may frame /visits.
    headers: () =>
      Promise.resolve([
        {
          source: "/visits",
          headers: [{ key: "Content-Security-Policy", value: \`${policy}\` }],
        },
      ]),
`,
  );
  if (after === before) {
    throw new Error(
      `${config} no longer has the line the framing journey adds headers() after.`,
    );
  }
  await writeFile(config, after);
  const route = async (name: string, headers: string) => {
    await mkdir(join(app, "src", "app", "framing", name), { recursive: true });
    await writeFile(
      join(app, "src", "app", "framing", name, "route.ts"),
      `export function GET(): Response {
  return new Response("${name}", { headers: ${headers} });
}
`,
    );
  };
  await route("own-header", `{ "X-Frame-Options": "DENY" }`);
  await route("allows-hub", `{ "Content-Security-Policy": \`${policy}\` }`);
}

/** What the hub's page saw framing the example's /visits. */
export interface FramedByHub {
  /** Each page the frame loaded. */
  bounce: string[];
  /** Where the frame ended, and the heading it showed. */
  landedAt: string;
  heading: string | null;
}

/**
 * The owner signs in to the example, then their token lapses, and the hub
 * frames the example's /visits. The frame renews the token through the
 * guard's, core's and the callback's redirects, and shows the page.
 */
export async function hubFramesJourney(
  options: JourneyOptions,
): Promise<FramedByHub> {
  const visits = `${options.install.origin(exampleSlug)}/visits`;
  const browser = await launch();
  try {
    const context = await browser.newContext();
    await openSignedIn(context, options);
    const cookie = await sessionCookieFor(context, visits);
    await context.addCookies([
      { ...cookie, value: await expiredTwin(cookie.value, options.adminUrl) },
    ]);
    const hub = await context.newPage();
    await hub.goto(`${options.install.origin("hub")}/`);
    const bounce: string[] = [];
    hub.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() !== hub.mainFrame()
      ) {
        bounce.push(request.url());
      }
    });

    await frame(hub, visits);

    const framed = hub.frames().find((one) => one.url() === visits);
    return {
      bounce,
      landedAt: framed?.url() ?? "",
      heading: (await framed?.getByRole("heading").textContent()) ?? null,
    };
  } finally {
    await browser.close();
  }
}

/**
 * The framing journeys, as tests of `dev`. `hubMayFrame` says the example
 * lets the hub frame `/visits` and has the framing route handlers, as
 * `letTheHubFrameNext` set up the Next example.
 */
export function testFramingJourneys(
  dev: DevStack,
  { hubFrames }: { hubFrames: boolean },
): void {
  it("refuses admin and the example in a frame on a sibling app's page", async () => {
    await dev.claimed();

    const journey = await siblingFramesJourney(dev.journey());

    const refused = { status: 200, xFrameOptions: "SAMEORIGIN", shown: false };
    expect(journey).toEqual({ admin: refused, example: refused });
  });

  it.runIf(hubFrames)(
    "lets the hub frame a page whose policy names it, renewing a lapsed token inside the frame",
    async () => {
      await dev.claimed();
      const visits = dev.at(exampleSlug, "/visits");

      const journey = await hubFramesJourney(dev.journey());

      expect(journey).toEqual({
        bounce: [
          visits,
          refreshing(dev, visits),
          handedBack(visits, { token: true }),
          visits,
        ],
        landedAt: visits,
        heading: "Your latest visits",
      });
    },
  );

  it.runIf(hubFrames)(
    "sends Next's page and route handlers with the guard's X-Frame-Options and their own policy",
    async () => {
      await dev.claimed();
      const cookie = await ownerCookie(dev.journey());
      const host = dev.hostOf(exampleSlug);
      const headersOf = async (path: string) => {
        const { status, headers } = await dev.send(host, path, {
          headers: { cookie },
        });
        return {
          status,
          frame: headers["x-frame-options"],
          policy: headers["content-security-policy"],
          sniff: headers["x-content-type-options"],
        };
      };

      const answers = {
        page: await headersOf("/visits"),
        ownHeader: await headersOf("/framing/own-header"),
        allowsHub: await headersOf("/framing/allows-hub"),
      };

      const allowed = {
        status: 200,
        frame: "SAMEORIGIN",
        policy: hubMayFrame(dev),
        sniff: "nosniff",
      };
      expect(answers).toEqual({
        page: allowed,
        ownHeader: { ...allowed, policy: undefined },
        allowsHub: allowed,
      });
    },
  );
}
