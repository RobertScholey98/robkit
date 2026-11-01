import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { coreKeys, readSessionToken } from "./index.ts";

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
  const jwk = { ...(await exportJWK(publicKey)), kid: "key-1", alg: "EdDSA" };
  const hosts: string[] = [];
  const server = createServer((req, res) => {
    hosts.push(`${String(req.headers.host)} ${String(req.url)}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const iat = Math.floor(now.getTime() / 1000);
  const token = await new SignJWT({ sid: "session-1", kind: "owner" })
    .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
    .setSubject("owner-1")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 900)
    .sign(privateKey);
  return { port, hosts, token };
}

describe("coreKeys", () => {
  it("fetches core's key through a *.localhost name, keeping the Host", async () => {
    const { port, hosts, token } = await fakeCore();
    const keys = coreKeys(`http://core.robkit.localhost:${String(port)}`);

    const read = await readSessionToken(keys, token, now);

    expect(read).toEqual({
      ownerId: "owner-1",
      sessionId: "session-1",
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
      reads.push((await readSessionToken(keys, token, now))?.ownerId);
    }

    expect(reads).toEqual(["owner-1", "owner-1", "owner-1"]);
    expect(hosts).toHaveLength(1);
  });
});
