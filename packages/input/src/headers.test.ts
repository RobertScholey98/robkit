import { describe, expect, it } from "vitest";
import { isRedirect, securityHeaders, withHeaders } from "./headers.ts";

describe("securityHeaders", () => {
  it("lets pages on the same origin frame an answer, over http", () => {
    expect(
      securityHeaders("http://example.robkit.localhost:3000", "same-origin"),
    ).toEqual([
      ["x-frame-options", "SAMEORIGIN"],
      ["x-content-type-options", "nosniff"],
    ]);
  });

  it("lets nobody frame an answer, and adds HSTS over https", () => {
    expect(securityHeaders("https://core.robkit.dev", "none")).toEqual([
      ["x-frame-options", "DENY"],
      ["content-security-policy", "frame-ancestors 'none'"],
      ["x-content-type-options", "nosniff"],
      ["strict-transport-security", "max-age=31536000"],
    ]);
  });

  it("gives a redirect no framing header", () => {
    expect(securityHeaders("https://core.robkit.dev", undefined)).toEqual([
      ["x-content-type-options", "nosniff"],
      ["strict-transport-security", "max-age=31536000"],
    ]);
  });
});

describe("isRedirect", () => {
  it.each([301, 302, 303, 307, 308])("calls %i a redirect", (status) => {
    expect(isRedirect(status)).toBe(true);
  });

  it.each([200, 304, 404])("doesn't call %i one", (status) => {
    expect(isRedirect(status)).toBe(false);
  });
});

describe("withHeaders", () => {
  const ours: [string, string][] = [
    ["x-frame-options", "SAMEORIGIN"],
    ["x-content-type-options", "nosniff"],
  ];

  it("adds each header the answer lacks, and keeps the app's own", async () => {
    const app = new Response("the app", {
      status: 201,
      headers: { "x-frame-options": "DENY", "set-cookie": "a=1" },
    });

    const res = withHeaders(app, ours);

    expect({
      status: res.status,
      headers: [...res.headers],
      body: await res.text(),
    }).toEqual({
      status: 201,
      headers: [
        ["content-type", "text/plain;charset=UTF-8"],
        ["set-cookie", "a=1"],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "DENY"],
      ],
      body: "the app",
    });
  });

  it("copies an answer whose headers can't change, such as Response.redirect()'s", () => {
    const res = withHeaders(
      Response.redirect("https://example.robkit.dev/", 302),
      ours,
    );

    expect([res.status, [...res.headers]]).toEqual([
      302,
      [
        ["location", "https://example.robkit.dev/"],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "SAMEORIGIN"],
      ],
    ]);
  });

  it("hands back an answer that has every header as it is", () => {
    const app = new Response(null, {
      headers: {
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
      },
    });

    expect(withHeaders(app, ours)).toBe(app);
  });
});
