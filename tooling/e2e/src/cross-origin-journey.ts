import { connect } from "node:net";
import { expect, it } from "vitest";
import { launch } from "./browser.ts";
import type { DevStack } from "./dev-stack.ts";
import { addedSlug, exampleSlug } from "./install.ts";
import { openSignedIn, visitsOn } from "./lapsed-call-journeys.ts";
import { sessionCookieFor, type JourneyOptions } from "./owner-journey.ts";

// A browser sends an app's cookie with a form posted from a sibling app,
// since both are on one site. The guard refuses it before the app's
// handler runs.

const refusal =
  "This app only accepts changes from its own pages, and this request came from another origin.";

/**
 * How the example's page posts: a script's fetch, as Go's, Next's and
 * Start's do, answered 200, or an HTML form, as React + Hono's and
 * Express's do, answered 303 back to the page.
 */
export type Posts = "fetch" | "form";

/** What the owner's browser did with the example's own POST. */
export interface CrossOriginWriteJourney {
  /** The status the example's page got for its own POST. */
  own: number;
  /**
   * The visit count on the page before the POST, once it had landed, and
   * after a reload, which records nothing.
   */
  visits: [number, number, number];
  /** The same POST, sent as a form from a page on the added app. */
  sibling: {
    /** The browser's `Sec-Fetch-Site`. */
    site: string | undefined;
    /** Whether the browser sent the example's session cookie with it. */
    sentCookie: boolean;
    status: number;
    body: string;
  };
}

/**
 * The owner opens the example and presses "Visit again", which posts to
 * the example's server from its page. Then a page on the added app posts a
 * form to the same address.
 */
export async function crossOriginWriteJourney(
  options: JourneyOptions,
): Promise<CrossOriginWriteJourney> {
  const example = options.install.origin(exampleSlug);
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await openSignedIn(context, options);
    const before = await visitsOn(page);
    const posted = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).origin === example,
    );
    await page.getByRole("button", { name: "Visit again" }).click();
    const own = await posted;
    await page.getByText(`Visits: ${String(before + 1)}`).waitFor();
    const after = await visitsOn(page);
    await page.reload();
    const reloaded = await visitsOn(page);

    const sibling = await context.newPage();
    await sibling.goto(`${options.install.origin(addedSlug)}/`);
    const refused = sibling.waitForResponse(
      (res) => res.request().method() === "POST" && res.url() === own.url(),
    );
    await sibling.evaluate((action) => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = action;
      document.body.append(form);
      form.submit();
    }, own.url());
    const res = await refused;
    const sent = await res.request().allHeaders();

    return {
      own: own.status(),
      visits: [before, after, reloaded],
      sibling: {
        site: sent["sec-fetch-site"],
        sentCookie: (sent.cookie ?? "").includes("robkit_session="),
        status: res.status(),
        body: await res.text(),
      },
    };
  } finally {
    await browser.close();
  }
}

/**
 * The status line's code for a WebSocket handshake sent to `host` through
 * the dev proxy with `headers`. It asks for Vite's ping socket, which Vite
 * opens without a token and closes at once.
 */
async function handshake(
  dev: DevStack,
  host: string,
  headers: Record<string, string>,
): Promise<number> {
  const socket = connect(dev.port(), "127.0.0.1");
  socket.write(
    [
      "GET / HTTP/1.1",
      `host: ${host}`,
      "connection: Upgrade",
      "upgrade: websocket",
      "sec-websocket-version: 13",
      "sec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-protocol: vite-ping",
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      "",
      "",
    ].join("\r\n"),
  );
  let reply = "";
  for await (const chunk of socket) {
    reply += String(chunk);
    if (reply.includes("\r\n")) break;
  }
  socket.destroy();
  return Number(reply.split(" ")[1]);
}

/** The owner's session cookie on the example, as a `Cookie` header. */
export async function ownerCookie(options: JourneyOptions): Promise<string> {
  const browser = await launch();
  try {
    const context = await browser.newContext();
    await openSignedIn(context, options);
    const cookie = await sessionCookieFor(
      context,
      options.install.origin(exampleSlug),
    );
    return `${cookie.name}=${cookie.value}`;
  } finally {
    await browser.close();
  }
}

/**
 * The cross-origin journeys, as tests of `dev`. `posts` says how the
 * example's page posts to its server, as every example's does. `viteSocket`
 * says the example's server passes Vite's hot-update socket through the
 * guard, as Go's does under `pnpm dev`.
 */
export function testCrossOriginJourney(
  dev: DevStack,
  { posts, viteSocket }: { posts: Posts; viteSocket: boolean },
): void {
  it("refuses the example's own POST sent from a sibling app's page", async () => {
    await dev.claimed();

    const journey = await crossOriginWriteJourney(dev.journey());

    const [before] = journey.visits;
    expect(journey).toEqual({
      own: posts === "form" ? 303 : 200,
      visits: [before, before + 1, before + 1],
      sibling: {
        site: "same-site",
        sentCookie: true,
        status: 403,
        body: refusal,
      },
    });
  });

  it.runIf(viteSocket)(
    "passes Vite's socket from the example's own origin, and refuses one from a sibling's",
    async () => {
      await dev.claimed();
      const cookie = await ownerCookie(dev.journey());
      const host = dev.hostOf(exampleSlug);
      const origin = (slug: typeof exampleSlug) => dev.addresses().origin(slug);

      const own = await handshake(dev, host, {
        origin: origin(exampleSlug),
        cookie,
      });
      const sibling = await handshake(dev, host, {
        origin: origin(addedSlug),
        cookie,
      });

      expect([own, sibling]).toEqual([101, 403]);
    },
  );
}
