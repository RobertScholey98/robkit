import { conformanceCases } from "@robkit/guard/conformance";
import { readSessionToken } from "@robkit/session";
import { describe, expect, it } from "vitest";
import { guest, owner, signingKey } from "./index.ts";

const now = () => new Date();

describe("signingKey", () => {
  it("signs an owner's token that reads back as core's would", async () => {
    const key = await signingKey();

    const read = await readSessionToken(
      key.publicKey,
      await key.token(),
      now(),
    );

    expect(read).toEqual({
      ...owner,
      sessionId: "session-1",
      expired: false,
    });
  });

  it("signs a guest's token carrying their roles", async () => {
    const key = await signingKey();

    const token = await key.token(0, guest(["family"]));
    const read = await readSessionToken(key.publicKey, token, now());

    expect(read).toEqual({
      kind: "guest",
      id: "code-1",
      roles: ["family"],
      sessionId: "session-1",
      expired: false,
    });
  });

  it("signs a token issued long enough ago to have expired", async () => {
    const key = await signingKey();

    const read = await readSessionToken(
      key.publicKey,
      await key.token(20 * 60),
      now(),
    );

    expect(read?.expired).toBe(true);
  });

  it("signs tokens another key can't vouch for", async () => {
    const [core, forger] = await Promise.all([signingKey(), signingKey()]);

    const read = await readSessionToken(
      core.publicKey,
      await forger.token(),
      now(),
    );

    expect(read).toBeUndefined();
  });

  it("gives each conformance case's visitor the cookie they'd send", async () => {
    const key = await signingKey();

    const sent = await Promise.all(
      conformanceCases.map(async (asking) => {
        const { cookie } = await key.cookieFor(asking);
        const token = cookie?.replace(/^robkit_session=/, "");
        const read =
          token === undefined
            ? undefined
            : await readSessionToken(key.publicKey, token, now());
        const seen = read && { kind: read.kind, expired: read.expired };
        return [asking.session, seen] as const;
      }),
    );

    expect(new Map(sent)).toEqual(
      new Map([
        ["signed-out", undefined],
        ["expired", { kind: "owner", expired: true }],
        ["owner", { kind: "owner", expired: false }],
        ["guest", { kind: "guest", expired: false }],
      ]),
    );
  });
});
