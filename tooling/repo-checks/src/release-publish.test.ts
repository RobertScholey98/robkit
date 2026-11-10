// The release workflow's publish step, short of publishing: reading what
// npm has, handing pnpm the token, and refusing to start without one.
import { execFile, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isRecord } from "@robkit/input";
import { afterEach, describe, expect, it } from "vitest";
import { authEnv, publishArgs, registryVersions } from "./release.ts";

const run = promisify(execFile);

/**
 * The pnpm running these tests, the version the repo pins. Another pnpm on
 * PATH would fetch the pinned one from the stand-in registry.
 */
const pnpm = process.env.npm_execpath ?? "";

/** How to start that pnpm: a JS file through Node, a binary as it is. */
const [command = "", ...prefix] = /.[cm]?js$/.test(pnpm)
  ? [process.execPath, pnpm]
  : [pnpm];

/** A request the stand-in registry received. */
interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
}

let server: Server | undefined;

/**
 * A stand-in npm registry on 127.0.0.1 that answers with `answer` and
 * records each request.
 */
async function registry(
  answer: (request: IncomingMessage) => { status: number; body?: unknown },
): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  server = createServer((request, response) => {
    received.push({
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
    });
    request.resume();
    request.on("end", () => {
      const { status, body } = answer(request);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body ?? {}));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = isRecord(address) ? address.port : undefined;
  return { url: `http://127.0.0.1:${String(port)}`, received };
}

afterEach(async () => {
  if (server) {
    server.close();
    await once(server, "close");
    server = undefined;
  }
});

describe("registryVersions", () => {
  it("lists each version npm has of a package", async () => {
    const { url, received } = await registry(() => ({
      status: 200,
      body: { name: "@robkit/core", versions: { "0.1.0": {}, "0.2.0": {} } },
    }));

    expect(await registryVersions("@robkit/core", url)).toEqual([
      "0.1.0",
      "0.2.0",
    ]);
    expect(received.map(({ url }) => url)).toEqual(["/@robkit%2fcore"]);
  });

  it("lists none for a package npm has never seen", async () => {
    const { url } = await registry(() => ({ status: 404 }));

    expect(await registryVersions("@robkit/core", url)).toEqual([]);
  });

  it("fails when npm answers anything else, so nothing is published blind", async () => {
    const { url } = await registry(() => ({ status: 503 }));

    await expect(registryVersions("@robkit/core", url)).rejects.toThrow(
      `${url} answered 503 for @robkit/core, so the release can't tell what is published. Run the release again once npm answers.`,
    );
  });
});

describe("publishing through pnpm", () => {
  // Run through pnpm, as turbo does, so npm_execpath names it.
  it.runIf(/pnpm/i.test(pnpm))(
    "hands pnpm the token for the registry it publishes to",
    async () => {
      const { url, received } = await registry((request) => ({
        status: request.method === "PUT" ? 200 : 404,
      }));
      const dir = await mkdtemp(join(tmpdir(), "robkit-publish-"));
      try {
        await writeFile(
          join(dir, "package.json"),
          JSON.stringify({
            name: "@robkit/stand-in",
            version: "0.1.0",
            license: "MIT",
          }),
        );
        await writeFile(join(dir, "index.js"), "export {};\n");

        // Provenance needs the identity token only CI has, so this leaves it
        // out. Every other flag is the release's own.
        const args = publishArgs.filter((arg) => arg !== "--provenance");
        await run(command, [...prefix, ...args, "--registry", url], {
          cwd: dir,
          env: { ...process.env, ...authEnv("t0ken", url) },
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }

      const put = received.find(({ method }) => method === "PUT");
      expect(put?.url).toBe("/@robkit%2fstand-in");
      expect(put?.authorization).toBe("Bearer t0ken");
    },
    120_000,
  );

  it("publishes with provenance, as public, and runs no package script", () => {
    expect(publishArgs).toEqual([
      "publish",
      "--provenance",
      "--access",
      "public",
      "--no-git-checks",
      "--ignore-scripts",
    ]);
  });
});

describe("release-publish.ts", () => {
  it.each([undefined, ""])(
    "stops before it reads npm or publishes anything when NPM_TOKEN is %j",
    (token) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NPM_TOKEN: token };
      if (token === undefined) delete env.NPM_TOKEN;
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        ["release-publish.ts"],
        { cwd: import.meta.dirname, env, encoding: "utf8" },
      );

      expect(status).toBe(1);
      expect(stdout).toBe("");
      expect(stderr.trim()).toBe(
        'NPM_TOKEN is missing, so nothing was published. Add it as a secret of the release environment, as CONTRIBUTING.md\'s "Releasing" says, then run the release again.',
      );
    },
  );
});
