// What the release's publish step decides and how it hands pnpm the
// token, short of publishing: a stand-in registry answers.
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isRecord } from "@robkit/input";
import { afterEach, describe, expect, it } from "vitest";
import {
  authEnv,
  publishArgs,
  publishPlan,
  registryVersions,
  releasePackages,
} from "./publish-list.ts";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";

const run = promisify(execFile);

const root = join(import.meta.dirname, "../../..");

/** The name of every package robkit publishes, read from `packages/`. */
async function publishedNames(): Promise<string[]> {
  const manifests = await Promise.all(
    (await publishedPackages()).map((dir) =>
      readJsonFile(join(dir, "package.json"), readNamedManifest),
    ),
  );
  return manifests.map(({ name }) => name);
}

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

describe("publishPlan", () => {
  // Three packages at 0.2.0, as the fixed group releases them: input
  // underneath, guard on input, and create-robkit on both.
  const input = { name: "@robkit/input", version: "0.2.0", dependsOn: [] };
  const guard = {
    name: "@robkit/guard",
    version: "0.2.0",
    dependsOn: ["@robkit/input"],
  };
  const createRobkit = {
    name: "create-robkit",
    version: "0.2.0",
    dependsOn: ["@robkit/guard", "@robkit/input"],
  };
  const packages = [createRobkit, guard, input];

  it("publishes every package npm lacks, dependencies first, and tags nothing yet", () => {
    const published = new Map([
      ["@robkit/input", ["0.1.0"]],
      ["@robkit/guard", ["0.1.0"]],
      ["create-robkit", ["0.1.0"]],
    ]);

    expect(publishPlan(packages, published)).toEqual({
      publish: [input, guard, createRobkit],
      tag: undefined,
    });
  });

  it("publishes a package npm has never seen", () => {
    expect(publishPlan([input], new Map())).toEqual({
      publish: [input],
      tag: undefined,
    });
  });

  it("leaves out what a release that stopped halfway published, and waits to tag", () => {
    const halfway = new Map([
      ["@robkit/input", ["0.1.0", "0.2.0"]],
      ["@robkit/guard", ["0.1.0", "0.2.0"]],
      ["create-robkit", ["0.1.0"]],
    ]);

    expect(publishPlan(packages, halfway)).toEqual({
      publish: [createRobkit],
      tag: undefined,
    });
  });

  it("tags the version once the last package is on npm", () => {
    const all = new Map([
      ["@robkit/input", ["0.1.0", "0.2.0"]],
      ["@robkit/guard", ["0.1.0", "0.2.0"]],
      ["create-robkit", ["0.1.0", "0.2.0"]],
    ]);

    expect(publishPlan(packages, all)).toEqual({ publish: [], tag: "v0.2.0" });
  });

  it("refuses packages at different versions", () => {
    expect(() =>
      publishPlan([input, { ...guard, version: "0.1.1" }], new Map()),
    ).toThrow(
      "The packages aren't at one version (@robkit/input@0.2.0, @robkit/guard@0.1.1), so there is no one release to publish. Merge the version pull request that pnpm release:version opens.",
    );
  });
});

describe("releasePackages", () => {
  it("reads each published package's version and the packages it depends on", async () => {
    const packages = await releasePackages();
    const createRobkit = packages.find(({ name }) => name === "create-robkit");
    const names = await publishedNames();

    expect(packages.map(({ name }) => name).sort()).toEqual(names.sort());
    expect(createRobkit?.dependsOn).toContain("@robkit/input");
    expect(createRobkit?.dependsOn).not.toContain("prettier");
    expect(createRobkit?.dir).toBe(join(root, "packages", "create-robkit"));
    expect(new Set(packages.map(({ version }) => version)).size).toBe(1);
  });
});
