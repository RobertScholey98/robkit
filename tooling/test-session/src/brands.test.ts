import { readCodeId, readRoleId } from "@robkit/guard";
import { readCoreUrl, readDomain, readSlug } from "@robkit/input";
import { describe, expect, it } from "vitest";
import {
  aCodeId,
  aCoreOrigin,
  aDomain,
  aRoleId,
  aViewer,
  slug,
} from "./brands.ts";

describe("slug", () => {
  it("builds the slug the reader reads", () => {
    expect(slug("notes")).toBe(readSlug("notes"));
    expect(slug("hub")).toBe("hub");
  });

  it("throws for a name that isn't a slug", () => {
    expect(() => slug("Notes")).toThrow(
      `"Notes" can't be an app's slug, which is also its subdomain and database role.`,
    );
  });
});

describe("aDomain", () => {
  it("builds the domain the reader reads", () => {
    expect(aDomain("robkit.dev")).toBe(
      readDomain({ ROBKIT_DOMAIN: "robkit.dev" }),
    );
    expect(aDomain()).toBe("robkit.localhost");
  });

  it("throws for a value that isn't a domain alone", () => {
    expect(() => aDomain("https://robkit.dev")).toThrow(
      `ROBKIT_DOMAIN is "https://robkit.dev", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.`,
    );
  });
});

describe("aCoreOrigin", () => {
  it("builds the origin the reader reads", () => {
    expect(aCoreOrigin("https://core.robkit.dev")).toBe(
      readCoreUrl({ ROBKIT_CORE_URL: "https://core.robkit.dev" }),
    );
    expect(aCoreOrigin()).toBe("http://core.robkit.localhost:3000");
  });

  it("throws for a value that isn't core's origin", () => {
    expect(() => aCoreOrigin("https://hub.robkit.dev")).toThrow(
      `ROBKIT_CORE_URL is "https://hub.robkit.dev", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
    );
  });
});

describe("aCodeId", () => {
  it("builds the code id the guard reads", () => {
    expect(aCodeId("code-7")).toBe(readCodeId("code-7"));
    expect(aCodeId()).toBe("code-1");
  });

  it("throws for a value the guard refuses", () => {
    expect(() => aCodeId("")).toThrow(
      `"" isn't an access code's id, which is text that isn't empty.`,
    );
  });
});

describe("aRoleId", () => {
  it("builds the role id the guard reads", () => {
    expect(aRoleId("family")).toBe(readRoleId("family"));
  });

  it("throws for a value the guard refuses", () => {
    expect(() => aRoleId("")).toThrow(
      `"" isn't a role's id, which is text that isn't empty.`,
    );
  });
});

describe("aViewer", () => {
  it.each([
    [{ kind: "owner" } as const, { kind: "owner", id: "owner-1" }],
    [
      { kind: "owner", id: "owner-2" } as const,
      { kind: "owner", id: "owner-2" },
    ],
    [{ kind: "guest" } as const, { kind: "guest", id: "code-1", roles: [] }],
    [
      { kind: "guest", id: "code-2", roles: ["family", "friends"] } as const,
      { kind: "guest", id: "code-2", roles: ["family", "friends"] },
    ],
    [{ kind: "nobody" } as const, { kind: "nobody" }],
  ])("builds %j", (options, viewer) => {
    expect(aViewer(options)).toEqual(viewer);
  });

  it("throws for a guest with a role the guard refuses", () => {
    expect(() => aViewer({ kind: "guest", roles: [""] })).toThrow(
      `"" isn't a role's id, which is text that isn't empty.`,
    );
  });
});
