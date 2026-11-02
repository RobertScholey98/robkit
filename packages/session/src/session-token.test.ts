import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { describe, expect, it } from "vitest";
import { readSessionToken } from "./index.ts";

const issuedAt = new Date("2026-11-01T12:00:00Z");
const minute = 60_000;

async function keyPair() {
  return generateKeyPair("EdDSA", { crv: "Ed25519" });
}

function sign(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = { sid: "session-1", kind: "owner" },
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
      { sid: "session-1", kind: "guest", roles: ["role-1", "role-2"] },
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
        await sign(privateKey, { sid: "session-1", kind: "guest", ...claims }),
        issuedAt,
      );

    expect(await read({})).toBeUndefined();
    expect(await read({ roles: "role-1" })).toBeUndefined();
    expect(await read({ roles: ["role-1", 2] })).toBeUndefined();
    expect(await read({ roles: [] })).toMatchObject({ roles: [] });
  });

  it("refuses a token that isn't an owner's or a guest's session", async () => {
    const { privateKey, publicKey } = await keyPair();
    const stranger = await sign(privateKey, { sid: "session-1", kind: "bot" });
    const sessionless = await sign(privateKey, { kind: "owner" });

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

  it("refuses something that isn't a token", async () => {
    const { publicKey } = await keyPair();

    expect(
      await readSessionToken(publicKey, "not-a-token", issuedAt),
    ).toBeUndefined();
  });
});
