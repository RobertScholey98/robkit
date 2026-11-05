import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { describe, expect, it } from "vitest";
import { readAppToken, readSessionToken, sessionTokensIn } from "./index.ts";
import { slug } from "./test/slug.ts";

const notes = slug("notes");

const issuedAt = new Date("2026-11-01T12:00:00Z");
const minute = 60_000;

async function keyPair() {
  return generateKeyPair("EdDSA", { crv: "Ed25519" });
}

function sign(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = {
    aud: "core",
    sid: "session-1",
    kind: "owner",
  },
  subject = "owner-1",
): Promise<string> {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
    .setSubject(subject)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 15 * 60)
    .sign(privateKey);
}

describe("readSessionToken", () => {
  it("reads the owner and session from a live token", async () => {
    const { privateKey, publicKey } = await keyPair();

    const read = await readSessionToken(
      publicKey,
      await sign(privateKey),
      new Date(issuedAt.getTime() + minute),
    );

    expect(read).toEqual({
      kind: "owner",
      id: "owner-1",
      sessionId: "session-1",
      expired: false,
    });
  });

  it("still reads an expired token core signed, marked expired", async () => {
    const { privateKey, publicKey } = await keyPair();

    const read = await readSessionToken(
      publicKey,
      await sign(privateKey),
      new Date(issuedAt.getTime() + 16 * minute),
    );

    expect(read).toEqual({
      kind: "owner",
      id: "owner-1",
      sessionId: "session-1",
      expired: true,
    });
  });

  it("refuses a token signed with another key, live or expired", async () => {
    const core = await keyPair();
    const forger = await keyPair();
    const token = await sign(forger.privateKey);

    const live = await readSessionToken(core.publicKey, token, issuedAt);
    const expired = await readSessionToken(
      core.publicKey,
      token,
      new Date(issuedAt.getTime() + 16 * minute),
    );

    expect([live, expired]).toEqual([undefined, undefined]);
    expect(
      await readSessionToken(forger.publicKey, token, issuedAt),
    ).toMatchObject({ id: "owner-1" });
  });

  it("reads a guest's session, with the code's id as the holder and its roles", async () => {
    const { privateKey, publicKey } = await keyPair();
    const guest = await sign(
      privateKey,
      {
        aud: "core",
        sid: "session-1",
        kind: "guest",
        roles: ["role-1", "role-2"],
      },
      "code-1",
    );

    expect(await readSessionToken(publicKey, guest, issuedAt)).toEqual({
      kind: "guest",
      id: "code-1",
      sessionId: "session-1",
      roles: ["role-1", "role-2"],
      expired: false,
    });
  });

  it("refuses a guest's token without a list of role ids", async () => {
    const { privateKey, publicKey } = await keyPair();
    const read = async (claims: Record<string, unknown>) =>
      readSessionToken(
        publicKey,
        await sign(privateKey, {
          aud: "core",
          sid: "session-1",
          kind: "guest",
          ...claims,
        }),
        issuedAt,
      );

    expect(await read({})).toBeUndefined();
    expect(await read({ roles: "role-1" })).toBeUndefined();
    expect(await read({ roles: ["role-1", 2] })).toBeUndefined();
    expect(await read({ roles: [] })).toMatchObject({ roles: [] });
  });

  it("refuses a token that isn't an owner's or a guest's session", async () => {
    const { privateKey, publicKey } = await keyPair();
    const stranger = await sign(privateKey, {
      aud: "core",
      sid: "session-1",
      kind: "bot",
    });
    const sessionless = await sign(privateKey, { aud: "core", kind: "owner" });

    expect(
      await readSessionToken(publicKey, stranger, issuedAt),
    ).toBeUndefined();
    expect(
      await readSessionToken(publicKey, sessionless, issuedAt),
    ).toBeUndefined();
    expect(
      await readSessionToken(publicKey, await sign(privateKey), issuedAt),
    ).toMatchObject({ sessionId: "session-1" });
  });

  it.each([
    ["an app", { aud: "notes", sid: "session-1", kind: "owner" }],
    ["no audience", { sid: "session-1", kind: "owner" }],
  ])(
    "refuses a token for %s, live or expired, so core never renews one",
    async (_, claims) => {
      const { privateKey, publicKey } = await keyPair();
      const token = await sign(privateKey, claims);

      const live = await readSessionToken(publicKey, token, issuedAt);
      const expired = await readSessionToken(
        publicKey,
        token,
        new Date(issuedAt.getTime() + 16 * minute),
      );

      expect([live, expired]).toEqual([undefined, undefined]);
    },
  );

  it("refuses something that isn't a token", async () => {
    const { publicKey } = await keyPair();

    expect(
      await readSessionToken(publicKey, "not-a-token", issuedAt),
    ).toBeUndefined();
  });
});

describe("readAppToken", () => {
  const appToken = (
    privateKey: CryptoKey,
    claims: Record<string, unknown> = { aud: "notes", kind: "owner" },
  ) => sign(privateKey, claims);

  it("reads the viewer from a live token for its app", async () => {
    const { privateKey, publicKey } = await keyPair();
    const guest = await appToken(privateKey, {
      aud: "notes",
      kind: "guest",
      roles: ["role-1"],
    });

    const read = await readAppToken(publicKey, guest, issuedAt, notes);

    expect(read).toEqual({
      kind: "guest",
      id: "owner-1",
      roles: ["role-1"],
      expired: false,
    });
  });

  it("still reads an expired token for its app, marked expired", async () => {
    const { privateKey, publicKey } = await keyPair();

    const read = await readAppToken(
      publicKey,
      await appToken(privateKey),
      new Date(issuedAt.getTime() + 16 * minute),
      notes,
    );

    expect(read).toEqual({ kind: "owner", id: "owner-1", expired: true });
  });

  it.each([
    ["another app", { aud: "diary", kind: "owner" }],
    ["core", { aud: "core", sid: "session-1", kind: "owner" }],
    ["no audience", { sid: "session-1", kind: "owner" }],
    ["a list of audiences", { aud: ["notes", "diary"], kind: "owner" }],
  ])("refuses a token for %s, live or expired", async (_, claims) => {
    const { privateKey, publicKey } = await keyPair();
    const token = await appToken(privateKey, claims);

    const live = await readAppToken(publicKey, token, issuedAt, notes);
    const expired = await readAppToken(
      publicKey,
      token,
      new Date(issuedAt.getTime() + 16 * minute),
      notes,
    );

    expect([live, expired]).toEqual([undefined, undefined]);
  });

  it("refuses a token for its app signed with another key", async () => {
    const core = await keyPair();
    const forger = await keyPair();

    expect(
      await readAppToken(
        core.publicKey,
        await appToken(forger.privateKey),
        issuedAt,
        notes,
      ),
    ).toBeUndefined();
  });
});

describe("sessionTokensIn", () => {
  it("lists every session cookie a request sends, in order", () => {
    expect(
      sessionTokensIn(
        "theme=dark; robkit_session=a.b.c; other=1;robkit_session = d.e.f",
      ),
    ).toEqual(["a.b.c", "d.e.f"]);
  });

  it("lists none without a cookie header", () => {
    expect([sessionTokensIn(null), sessionTokensIn("theme=dark")]).toEqual([
      [],
      [],
    ]);
  });
});
