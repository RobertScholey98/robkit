// A local npm registry for robkit's packed packages, so the registry test
// runs the command a new owner runs, `npm create robkit`, before anything is
// on npm. It serves robkit's packages alone, published the moment they were
// packed. Any other package it sends on to npm, so npm serves those as it
// would to an owner.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  isRecord,
  isProblem,
  orThrow,
  parseJson,
  problem,
} from "@robkit/input";

const run = promisify(execFile);

const npm = "https://registry.npmjs.org";

const checkout = fileURLToPath(new URL("../../../", import.meta.url));

/** An npm registry on 127.0.0.1 that serves robkit's packed packages. */
export interface LocalRegistry {
  /** Its origin, such as `http://127.0.0.1:4873`. */
  readonly url: string;
  /** The version of each package it serves, by name. */
  readonly versions: ReadonlyMap<string, string>;
  close(): Promise<void>;
}

interface Packed {
  manifest: Record<string, unknown> & { name: string; version: string };
  tarball: Buffer;
  /** When it was packed, which the registry gives as when it was published. */
  published: string;
}

/**
 * Packs every package under the checkout's `packages/` into `out`, as
 * `pnpm publish` would. turbo has built them: the registry test runs after
 * the repo checks' typecheck, which builds every published package.
 */
export async function packRobkit(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  await run(
    "pnpm",
    [
      "--recursive",
      "--filter",
      "./packages/*",
      "pack",
      "--pack-destination",
      out,
    ],
    { cwd: checkout, maxBuffer: 1 << 24 },
  );
}

/** A packed manifest's name and version, which a registry serves it by. */
function readPackedManifest(json: unknown, source: string) {
  if (!isRecord(json)) return problem(`${source} isn't a JSON object.`);
  const { name, version } = json;
  if (typeof name !== "string" || typeof version !== "string") {
    return problem(`${source} has no name or version.`);
  }
  return { ...json, name, version };
}

async function readPacked(dir: string): Promise<Map<string, Packed>> {
  const packed = new Map<string, Packed>();
  const published = new Date().toISOString();
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".tgz")) continue;
    const { stdout } = await run("tar", [
      "-xzOf",
      join(dir, file),
      "package/package.json",
    ]);
    const parsed = parseJson(stdout, `${file}'s package.json`);
    const manifest = orThrow(
      isProblem(parsed)
        ? parsed
        : readPackedManifest(parsed.json, `${file}'s package.json`),
    );
    const tarball = await readFile(join(dir, file));
    packed.set(manifest.name, { manifest, tarball, published });
  }
  return packed;
}

/** npm's path to a version's tarball, such as `@robkit/core/-/core-0.0.0.tgz`. */
function tarballPath({ name, version }: Packed["manifest"]): string {
  return `${name}/-/${name.split("/").pop() ?? name}-${version}.tgz`;
}

/** The registry's document for one package, as npm's would be. */
function packument({ manifest, tarball, published }: Packed, url: string) {
  return {
    name: manifest.name,
    "dist-tags": { latest: manifest.version },
    versions: {
      [manifest.version]: {
        ...manifest,
        dist: {
          tarball: `${url}/${tarballPath(manifest)}`,
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
          shasum: createHash("sha1").update(tarball).digest("hex"),
        },
      },
    },
    // Published as it was packed, seconds ago, so pnpm's release-age rule
    // refuses it unless the install exempts it.
    time: {
      created: published,
      modified: published,
      [manifest.version]: published,
    },
  };
}

/**
 * Serves each tarball in `dir` as the one version of its package, published
 * when this was called. A request for any other package is sent on to npm.
 */
export async function serveRobkit(dir: string): Promise<LocalRegistry> {
  const packed = await readPacked(dir);
  let url = "";

  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "/").slice(1);
    const tarball = /^(.+)\/-\/[^/]+\.tgz$/.exec(path);
    const entry = packed.get(tarball?.[1] ?? path);
    if (entry === undefined) {
      // Not robkit's: npm answers it, as it would for an owner.
      response.writeHead(302, { location: `${npm}${request.url ?? "/"}` });
      response.end();
      return;
    }
    if (tarball !== null) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(entry.tarball);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(packument(entry, url)));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!isRecord(address) || typeof address.port !== "number") {
    throw new Error(
      `The local registry listens on ${JSON.stringify(address)}, not a port.`,
    );
  }
  url = `http://127.0.0.1:${String(address.port)}`;
  return {
    url,
    versions: new Map(
      [...packed].map(([name, { manifest }]) => [name, manifest.version]),
    ),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
