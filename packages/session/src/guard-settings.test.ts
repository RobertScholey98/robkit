import {
  fakeCore,
  owner,
  printedOnExit,
  type FakeCore,
} from "@internal/test-session";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appOrigin,
  coreOrigin,
  requestGuard,
  type GuardedOptions,
} from "./index.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

const notSet = {
  app: "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.",
  core: "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
};
const notASlug = (name: string, value: string) =>
  `${name}: "${value}" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`;
const httpOffLocal = (name: string, value: string) =>
  `${name} is "${value}", which is http on a domain that isn't local. Serve the install over https and set it to ${value.replace(/^http:/, "https:")}.`;

/** Sets the app's environment as pnpm dev does: each value, or unset. */
function setEnv(app: string | undefined, core: string | undefined): void {
  vi.stubEnv("ROBKIT_APP", app);
  vi.stubEnv("ROBKIT_CORE_URL", core);
}

/** Who `options`' guard lets in when the owner loads a page. */
async function whoIsLetIn(
  core: FakeCore,
  options?: GuardedOptions,
): Promise<unknown> {
  const check = requestGuard(options);
  const decision = await check(
    new Request(core.page, {
      headers: {
        "sec-fetch-mode": "navigate",
        cookie: `robkit_session=${await core.key.token()}`,
      },
    }),
  );
  return decision.outcome === "serve" ? decision.viewer : decision.response;
}

describe("requestGuard, reading its own settings", () => {
  it("reads ROBKIT_APP and ROBKIT_CORE_URL when it's given no options", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "owner" };
    setEnv("example", core.origin);

    expect(await whoIsLetIn(core)).toEqual(owner);
    expect(await whoIsLetIn(core, { access: { kind: "owner" } })).toEqual(
      owner,
    );
  });

  it("reads only the setting it isn't given", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "owner" };
    setEnv("Not-This", core.origin);
    expect(await whoIsLetIn(core, { app: "example" })).toEqual(owner);

    setEnv("example", "http://core.example.com");
    expect(await whoIsLetIn(core, { core: core.origin })).toEqual(owner);
  });

  it("exits with every setting that's missing, a line each", () => {
    setEnv(undefined, "");

    expect(printedOnExit(() => requestGuard())).toBe(
      `${notSet.app}\n${notSet.core}`,
    );
  });

  it("exits with the reader's message for a setting that won't do", () => {
    setEnv("Notes", "http://core.example.com");

    expect(printedOnExit(() => requestGuard())).toBe(
      `${notASlug("ROBKIT_APP", "Notes")}\n${httpOffLocal("ROBKIT_CORE_URL", "http://core.example.com")}`,
    );
  });
});

describe("requestGuard, given its settings in code", () => {
  it("takes the app and core's origin as plain strings", async () => {
    const core = await fakeCore();
    setEnv(undefined, undefined);

    expect(
      await whoIsLetIn(core, {
        app: "example",
        core: String(core.origin),
        access: { kind: "owner" },
      }),
    ).toEqual(owner);
  });

  it("exits with the reader's message, naming the option, for one that won't do", () => {
    const core = "http://core.robkit.localhost:3000";

    expect(printedOnExit(() => requestGuard({ app: "Notes", core }))).toBe(
      notASlug("guarded()'s app", "Notes"),
    );
    expect(
      printedOnExit(() => requestGuard({ app: "notes", core: "core.robkit" })),
    ).toBe(
      `guarded()'s core is "core.robkit", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
    );
  });

  it("refuses core over http on a domain that isn't local, however it came", () => {
    const core = "http://core.example.com";

    expect(printedOnExit(() => requestGuard({ app: "notes", core }))).toBe(
      httpOffLocal("guarded()'s core", core),
    );
  });
});

describe("appOrigin", () => {
  it("reads what it isn't given as the guard does", () => {
    setEnv("notes", "https://core.robkit.dev/");

    expect([
      appOrigin(),
      appOrigin({ app: "todo" }),
      appOrigin({ core: "http://core.robkit.localhost:3000" }),
    ]).toEqual([
      "https://notes.robkit.dev",
      "https://todo.robkit.dev",
      "http://notes.robkit.localhost:3000",
    ]);
  });
});

describe("coreOrigin", () => {
  it("is core's origin from ROBKIT_CORE_URL, with any path dropped", () => {
    setEnv(undefined, "https://Core.robkit.dev/x?y");

    expect(coreOrigin()).toBe("https://core.robkit.dev");
  });

  it("exits with the reader's message when it's unset or won't do", () => {
    setEnv(undefined, undefined);
    expect(printedOnExit(() => coreOrigin())).toBe(notSet.core);

    setEnv(undefined, "http://core.example.com");
    expect(printedOnExit(() => coreOrigin())).toBe(
      httpOffLocal("ROBKIT_CORE_URL", "http://core.example.com"),
    );
  });
});
