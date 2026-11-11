import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coreKeys } from "./core-keys.ts";
import { readAppToken } from "./index.ts";
import { slug } from "@internal/test-session";

const notes = slug("notes");

const now = new Date("2026-11-01T12:00:00Z");
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }),
  );
});

/** Core's JWKS endpoint on a loopback port, recording each request's Host. */
async function fakeCore() {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
  });
  // Named and served as core names and serves its key.
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  const jwk = { ...publicJwk, kid, alg: "EdDSA", use: "sig" };
  const hosts: string[] = [];
  const answer = { status: 200 };
  const server = createServer((req, res) => {
    hosts.push(`${String(req.headers.host)} ${String(req.url)}`);
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const iat = Math.floor(now.getTime() / 1000);
  const sign = (kid: string) =>
    new SignJWT({ aud: "notes", kind: "owner" })
      .setProtectedHeader({ alg: "EdDSA", kid })
      .setSubject("owner-1")
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(privateKey);
  return { port, hosts, answer, token: await sign(kid), sign };
}

describe("coreKeys", () => {
  it("fetches core's key through a *.localhost name, keeping the Host", async () => {
    const { port, hosts, token } = await fakeCore();
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);

    const read = await readAppToken(keys, token, now, notes);

    expect(read).toEqual({
      kind: "owner",
      id: "owner-1",
      expired: false,
    });
    expect(hosts).toEqual([
      `core.robkit.localhost:${String(port)} /.well-known/jwks.json`,
    ]);
  });

  it("fetches the key once for many tokens", async () => {
    const { port, hosts, token } = await fakeCore();
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);

    const reads = [];
    for (let i = 0; i < 3; i++) {
      reads.push((await readAppToken(keys, token, now, notes))?.id);
    }

    expect(reads).toEqual(["owner-1", "owner-1", "owner-1"]);
    expect(hosts).toHaveLength(1);
  });

  it("throws when core's keys can't be fetched, rather than reading a bad token", async () => {
    const { port, answer, token } = await fakeCore();
    answer.status = 503;
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);

    await expect(readAppToken(keys, token, now, notes)).rejects.toThrow(
      "Expected 200 OK from the JSON Web Key Set HTTP response",
    );
  });

  it("reads a token whose key core doesn't have as no token", async () => {
    const { port, token, sign } = await fakeCore();
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);

    const known = await readAppToken(keys, token, now, notes);
    const unknown = await readAppToken(keys, await sign("key-2"), now, notes);

    expect(known?.id).toBe("owner-1");
    expect(unknown).toBeUndefined();
  });

  it("keeps using a cached key while core can't answer", async () => {
    const { port, answer, token } = await fakeCore();
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);
    await readAppToken(keys, token, now, notes);
    answer.status = 503;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60_000);
    try {
      expect((await readAppToken(keys, token, now, notes))?.id).toBe("owner-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks TLS to an https core, so a plaintext server never sees a request", async () => {
    const { port, hosts, token } = await fakeCore();
    const keys = coreKeys(`https://core.robkit.localhost:${String(port)}`);

    const read = readAppToken(keys, token, now, notes);

    await expect(read).rejects.toMatchObject({
      name: "CoreUnreachableError",
      cause: { code: "EPROTO" },
    });
    expect(hosts).toEqual([]);
  });
});
