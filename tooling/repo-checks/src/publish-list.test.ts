// What the release's publish step decides and how it hands pnpm the
// token, short of publishing: a stand-in registry answers.
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isRecord } from "@robkit/input";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authEnv,
  matchTarballs,
  publishArgs,
  publishPlan,
  readTarball,
  registryVersions,
  releasePackages,
  tarballName,
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
const [command = "", ...prefix] = /\.[cm]?js$/.test(pnpm)
  ? [process.execPath, pnpm]
  : [pnpm];

/** A request the stand-in registry received. */
interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
  /** What the request sent, as text. */
  body: string;
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
    const got: Received = {
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
      body: "",
    };
    received.push(got);
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      got.body += chunk;
    });
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

/**
 * Packs a stand-in package with the pnpm running the tests, as the pack job
 * does, and gives the tarball's path. Its `publishConfig` swaps the export
 * for built JS, as robkit's packages' do.
 */
async function packStandIn(dir: string): Promise<string> {
  const source = join(dir, "source");
  const out = join(dir, "out");
  await mkdir(source);
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "@robkit/stand-in",
      version: "0.1.0",
      license: "MIT",
      exports: { ".": "./src/index.ts" },
      publishConfig: { exports: { ".": "./index.js" } },
    }),
  );
  await writeFile(join(source, "index.js"), "export {};\n");
  await run(command, [...prefix, "pack", "--pack-destination", out], {
    cwd: source,
  });
  return join(out, "robkit-stand-in-0.1.0.tgz");
}

/** The environment of a run that no CI provider would recognise. */
function outsideCi(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== "CI" && !key.startsWith("GITHUB_"),
    ),
  );
}

// Run through pnpm, as turbo does, so npm_execpath names it.
describe.runIf(/pnpm/i.test(pnpm))(
  "pnpm publish <tarball>",
  { timeout: 120_000 },
  () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "robkit-publish-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("sends the packed tarball unchanged, with the token", async () => {
      const { url, received } = await registry((request) => ({
        status: request.method === "PUT" ? 200 : 404,
      }));
      const tarball = await packStandIn(dir);
      // Provenance needs the identity token only CI has, so this leaves it
      // out. Every other flag is the release's own.
      const args = publishArgs(tarball).filter((arg) => arg !== "--provenance");

      await run(command, [...prefix, ...args, "--registry", url], {
        cwd: dir,
        env: { ...process.env, ...authEnv("t0ken", url) },
      });

      const put = received.find(({ method }) => method === "PUT");
      expect(put?.url).toBe("/@robkit%2fstand-in");
      expect(put?.authorization).toBe("Bearer t0ken");
      const sent: unknown = JSON.parse(put?.body ?? "{}");
      const attachments = isRecord(sent) ? sent._attachments : undefined;
      const [attachment] = isRecord(attachments)
        ? Object.values(attachments)
        : [];
      const data = isRecord(attachment) ? attachment.data : undefined;
      expect(Buffer.from(String(data), "base64")).toEqual(
        await readFile(tarball),
      );
      // The manifest pnpm sends is the packed one, publishConfig applied.
      const versions = isRecord(sent) ? sent.versions : undefined;
      expect(isRecord(versions) && versions["0.1.0"]).toMatchObject({
        exports: { ".": "./index.js" },
      });
    });

    it("takes --provenance with a tarball, and sends nothing without CI's identity", async () => {
      const { url, received } = await registry(() => ({ status: 404 }));
      const tarball = await packStandIn(dir);

      const publishing = run(
        command,
        [...prefix, ...publishArgs(tarball), "--registry", url],
        { cwd: dir, env: { ...outsideCi(), ...authEnv("t0ken", url) } },
      );

      const failure = await publishing.then(
        () => undefined,
        (error: unknown) => error,
      );
      // pnpm prints its errors to stdout.
      expect(isRecord(failure) && failure.stdout).toContain(
        "Automatic provenance generation not supported for provider: null",
      );
      expect(received.filter(({ method }) => method === "PUT")).toEqual([]);
    });
  },
);

describe("publishArgs", () => {
  it("publishes the tarball with provenance, as public, and runs no package script", () => {
    expect(publishArgs("/tmp/robkit-core-0.1.0.tgz")).toEqual([
      "publish",
      "/tmp/robkit-core-0.1.0.tgz",
      "--provenance",
      "--access",
      "public",
      "--no-git-checks",
      "--ignore-scripts",
    ]);
  });
});

describe("tarballName", () => {
  it("names a tarball as pnpm pack does", () => {
    expect(tarballName("@robkit/core", "0.1.0")).toBe("robkit-core-0.1.0.tgz");
    expect(tarballName("create-robkit", "0.1.0")).toBe(
      "create-robkit-0.1.0.tgz",
    );
  });
});

describe("readTarball", () => {
  it("reads the name and version a tarball's manifest gives", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-tarball-"));
    try {
      await mkdir(join(dir, "package"));
      await writeFile(
        join(dir, "package/package.json"),
        JSON.stringify({ name: "@robkit/core", version: "0.1.0" }),
      );
      await run("tar", ["-czf", "robkit-core-0.1.0.tgz", "package"], {
        cwd: dir,
      });

      expect(await readTarball(join(dir, "robkit-core-0.1.0.tgz"))).toEqual({
        file: "robkit-core-0.1.0.tgz",
        name: "@robkit/core",
        version: "0.1.0",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("matchTarballs", () => {
  const core = { name: "@robkit/core", version: "0.1.0", dependsOn: [] };
  const createRobkit = {
    name: "create-robkit",
    version: "0.1.0",
    dependsOn: ["@robkit/core"],
  };
  const tarball = (file: string, name: string, version: string) => ({
    file,
    name,
    version,
  });
  const sound = [
    tarball("robkit-core-0.1.0.tgz", "@robkit/core", "0.1.0"),
    tarball("create-robkit-0.1.0.tgz", "create-robkit", "0.1.0"),
  ];

  it("pairs each of main's packages with its tarball", () => {
    expect(matchTarballs([core, createRobkit], sound)).toEqual({
      matched: [
        { ...core, tarball: "robkit-core-0.1.0.tgz" },
        { ...createRobkit, tarball: "create-robkit-0.1.0.tgz" },
      ],
      problems: [],
    });
  });

  it("names a package the artifact has no tarball for", () => {
    expect(
      matchTarballs([core, createRobkit], sound.slice(1)).problems,
    ).toEqual([
      "The pack job's artifact has no robkit-core-0.1.0.tgz for @robkit/core@0.1.0, which main holds. Run the release again from main.",
    ]);
  });

  it("refuses a tarball that holds another package or version than its name says", () => {
    expect(
      matchTarballs(
        [core, createRobkit],
        [
          tarball("robkit-core-0.1.0.tgz", "@robkit/core", "0.0.9"),
          tarball("create-robkit-0.1.0.tgz", "@robkit/other", "0.1.0"),
        ],
      ).problems,
    ).toEqual([
      "robkit-core-0.1.0.tgz holds @robkit/core@0.0.9, not @robkit/core@0.1.0 as main has it, so nothing was published. Run the release again from main.",
      "create-robkit-0.1.0.tgz holds @robkit/other@0.1.0, not create-robkit@0.1.0 as main has it, so nothing was published. Run the release again from main.",
    ]);
  });

  it("refuses a tarball that isn't one of main's packages at its version", () => {
    expect(
      matchTarballs(
        [core, createRobkit],
        [...sound, tarball("robkit-core-0.0.9.tgz", "@robkit/core", "0.0.9")],
      ).problems,
    ).toEqual([
      "robkit-core-0.0.9.tgz isn't one of main's packages at its version, so nothing was published. Run the release again from main.",
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
