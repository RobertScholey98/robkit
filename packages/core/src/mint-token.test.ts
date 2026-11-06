import { slug } from "@internal/test-addresses";
import { aCodeId, aRoleId } from "@internal/test-session";
import type { SignedInViewer } from "@robkit/guard";
import { readAppToken, readSessionToken } from "@robkit/session";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { mintAppToken, mintSessionToken } from "./mint-token.ts";
import type { SigningKey } from "./signing-key.ts";

const now = new Date("2026-11-01T12:00:00Z");
const fifteenMinutesOn = new Date("2026-11-01T12:15:01Z");

async function aSigningKey(): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return {
    kid: "key-1",
    privateKey,
    publicKey,
    publicJwk: await exportJWK(publicKey),
  };
}

describe("mintSessionToken", () => {
  it("names the session and a guest's roles, for core alone", async () => {
    const key = await aSigningKey();
    const token = await mintSessionToken(
      key,
      {
        kind: "guest",
        id: aCodeId(),
        sessionId: "session-1",
        roles: [aRoleId("role-family")],
      },
      now,
    );

    expect(await readSessionToken(key.publicKey, token, now)).toEqual({
      kind: "guest",
      id: "code-1",
      sessionId: "session-1",
      roles: ["role-family"],
      expired: false,
    });
    expect(await readAppToken(key.publicKey, token, now, slug("notes"))).toBe(
      undefined,
    );
  });

  it("expires 15 minutes after it is minted", async () => {
    const key = await aSigningKey();
    const token = await mintSessionToken(
      key,
      { kind: "owner", id: "owner-1", sessionId: "session-1" },
      now,
    );

    expect(
      await readSessionToken(key.publicKey, token, fifteenMinutesOn),
    ).toEqual({
      kind: "owner",
      id: "owner-1",
      sessionId: "session-1",
      expired: true,
    });
  });
});

describe("mintAppToken", () => {
  it("names the viewer for one app, and no session", async () => {
    const key = await aSigningKey();
    const notes = slug("notes");
    const guest: SignedInViewer = {
      kind: "guest",
      id: aCodeId(),
      roles: [aRoleId("role-family")],
    };
    const token = await mintAppToken(key, guest, notes, now);

    expect(await readAppToken(key.publicKey, token, now, notes)).toEqual({
      kind: "guest",
      id: "code-1",
      roles: ["role-family"],
      expired: false,
    });
    expect(await readAppToken(key.publicKey, token, now, slug("diary"))).toBe(
      undefined,
    );
    expect(await readSessionToken(key.publicKey, token, now)).toBe(undefined);
  });
});
