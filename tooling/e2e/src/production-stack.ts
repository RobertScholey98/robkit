import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort, removeWhenGone } from "@internal/test-postgres";
import { install, type Install } from "@robkit/session/addresses";
import { deploymentOf } from "create-robkit";

const run = promisify(execFile);

/** A domain no real host answers, so the stack can't reach the internet. */
export const domain = "robkit.test";

/** The host's Postgres admin URL, as the containers reach it. */
const adminUrl = "postgres://postgres:postgres@postgres:5432/robkit";

/** The install's database secret on this host. */
const secret = "the production e2e's database secret, 32+ characters";

/**
 * Prefixes and labels everything the stack makes: its network, containers
 * and images.
 */
export const stackName = `robkit-prod-${String(process.pid)}`;

/** The stack's network, named under its prefix. */
const network = `${stackName}-network`;

/**
 * A production-like host in Docker: a network with Postgres, and Caddy in
 * front of every app on `<slug>.robkit.test` over https with its own CA, as
 * Traefik fronts each container on Coolify.
 */
export interface Stack {
  /** Prefixes and labels every container and image. */
  name: string;
  /** The install, built from its root. */
  dir: string;
  /** The https port, the same inside the network and on the host. */
  port: number;
  /** Holds the Caddyfile and Caddy's root certificate. */
  caDir: string;
  addresses: Install;
  /** Names the install's layers in the build cache, when there is one. */
  cacheScope: string;
}

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await run("docker", args, {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function until(attempt: () => Promise<unknown>): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** Where the tunnel delivers requests to the stand-in for Traefik. */
const tunnelPort = 8080;

/**
 * Caddy plays both of R's hosts' proxies. Its https site is Cloudflare: it
 * ends TLS and names the visitor in `CF-Connecting-IP`, replacing any value
 * the visitor sent. It hands every request through one hop, as the tunnel
 * does, to its plain http site, which is Traefik. Traefik appends the hop's
 * own address to `X-Forwarded-For`, so every visitor's ends the same way.
 */
function caddyfile(port: number): string {
  return `{
  local_certs
  skip_install_trust
  https_port ${String(port)}
  servers :${String(tunnelPort)} {
    trusted_proxies static private_ranges
  }
}

*.${domain} {
  tls internal
  reverse_proxy 127.0.0.1:${String(tunnelPort)} {
    header_up CF-Connecting-IP {remote_host}
  }
}

http://*.${domain}:${String(tunnelPort)} {
  reverse_proxy {labels.2}:3000
}
`;
}

/**
 * Starts the host for the install in `dir`. Caddy answers every name in
 * `slugs` inside the network too, so the apps reach core over https as
 * they would on Coolify.
 */
export async function startStack(
  dir: string,
  slugs: string[],
  cacheScope: string,
): Promise<Stack> {
  const name = stackName;
  // Its containers, images and network go even if this process is killed.
  removeWhenGone({ docker: name });
  const port = await freePort();
  const caDir = await mkdtemp(join(tmpdir(), "robkit-caddy-"));
  await writeFile(join(caDir, "Caddyfile"), caddyfile(port));
  await docker("network", "create", "--label", name, network);
  await docker(
    "run",
    "-d",
    "--label",
    name,
    "--network",
    network,
    "--name",
    `${name}-postgres`,
    "--network-alias",
    "postgres",
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-e",
    "POSTGRES_DB=robkit",
    "postgres:18-alpine",
  );
  await docker(
    "run",
    "-d",
    "--label",
    name,
    "--network",
    network,
    "--name",
    `${name}-caddy`,
    ...slugs.flatMap((slug) => ["--network-alias", `${slug}.${domain}`]),
    "-p",
    `127.0.0.1:${String(port)}:${String(port)}`,
    "-v",
    `${join(caDir, "Caddyfile")}:/etc/caddy/Caddyfile:ro`,
    "caddy:2-alpine",
  );
  const root = "/data/caddy/pki/authorities/local/root.crt";
  await until(() => docker("exec", `${name}-caddy`, "test", "-f", root));
  await docker("cp", `${name}-caddy:${root}`, join(caDir, "root.crt"));
  // docker cp keeps Caddy's 0600, owned by whoever runs the test. The apps
  // run as node, uid 1000, which reads it only when the two happen to match,
  // as in WSL but not on GitHub's runners. The certificate is public.
  await chmod(join(caDir, "root.crt"), 0o644);
  // Over TCP, as Compose checks it: the first-run server is socket-only.
  await until(() =>
    docker(
      "exec",
      `${name}-postgres`,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "robkit",
    ),
  );
  return {
    name,
    dir,
    port,
    caDir,
    addresses: install({ domain, protocol: "https", port }),
    cacheScope,
  };
}

/**
 * Removes every container, image and the network the stack made, whether
 * or not it finished starting.
 */
export async function stopStack(): Promise<void> {
  const name = stackName;
  const containers = (await docker("ps", "-aq", "--filter", `label=${name}`))
    .split("\n")
    .filter(Boolean);
  if (containers.length > 0) await docker("rm", "-f", ...containers);
  const images = (
    await docker("images", "-q", "--filter", `reference=${name}/*`)
  )
    .split("\n")
    .filter(Boolean);
  if (images.length > 0) await docker("rmi", "-f", ...images);
  await docker("network", "rm", network).catch(() => undefined);
}

/**
 * Builds `slug`'s image from the install's Dockerfile, as Coolify does.
 *
 * With `ROBKIT_BUILD_CACHE` set to a BuildKit cache backend, such as
 * `type=gha` on GitHub's runners, the build reads and writes its layers
 * there, one scope per install and app, so a run after one that built the
 * same install reuses them. Without it, the local Docker's own cache
 * serves, as it does between runs on a laptop.
 */
export async function buildApp(stack: Stack, slug: string): Promise<void> {
  const cache = process.env.ROBKIT_BUILD_CACHE;
  const scope = `scope=${stack.cacheScope}-${slug}`;
  const { stderr } = await run(
    "docker",
    [
      ...(cache
        ? [
            "buildx",
            "build",
            "--load",
            "--cache-from",
            `${cache},${scope}`,
            "--cache-to",
            `${cache},mode=max,${scope}`,
          ]
        : ["build"]),
      "--progress=plain",
      "--build-arg",
      `ROBKIT_APP=${slug}`,
      "-t",
      `${stack.name}/${slug}`,
      ".",
    ],
    { cwd: stack.dir, maxBuffer: 64 * 1024 * 1024 },
  );
  console.log(`${stack.cacheScope} ${slug}: ${cachedSteps(stderr)}`);
}

/**
 * How many of a build's Dockerfile steps came from the cache, from
 * BuildKit's plain progress, where each step is `#<n> [stage i/n]` and a
 * reused one also prints `#<n> CACHED`.
 */
export function cachedSteps(progress: string): string {
  const steps = new Set<string>();
  const cached = new Set<string>();
  for (const line of progress.split("\n")) {
    // A Dockerfile step names its stage and place: `[build 3/5]`.
    const step = /^#(\d+) \[[^\]]*\d+\/\d+\]/.exec(line);
    if (step?.[1]) steps.add(step[1]);
    const hit = /^#(\d+) CACHED/.exec(line);
    if (hit?.[1]) cached.add(hit[1]);
  }
  const reused = [...steps].filter((step) => cached.has(step)).length;
  return `${String(reused)} of ${String(steps.size)} steps cached`;
}

/**
 * The packages in `slug`'s image that nothing in production needs, as
 * `name@version`, found by `extraneous-packages.js` running in the image.
 */
export async function extraneousPackages(
  stack: Stack,
  slug: string,
): Promise<string[]> {
  const script = await readFile(
    new URL("extraneous-packages.js", import.meta.url),
  );
  const docker = spawn(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      "--entrypoint",
      "node",
      `${stack.name}/${slug}`,
      "--input-type=module",
      "-",
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  docker.stdin.end(script);
  let output = "";
  docker.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  const [code] = (await once(docker, "close")) as [number | null];
  if (code !== 0)
    throw new Error(`the check in ${slug}'s image exited ${String(code)}`);
  return output.split("\n").filter(Boolean);
}

/**
 * Each app's environment, as `robkit deploy` sets it on Coolify, with the
 * host's shared variables filled in: the admin URL and secret, and each
 * app's DATABASE_URL as `robkit database-urls` printed it for the owner.
 */
export async function hostEnv(
  stack: Stack,
): Promise<Map<string, Record<string, string>>> {
  const { stdout } = await run("pnpm", ["run", "robkit", "database-urls"], {
    cwd: stack.dir,
    env: {
      ...process.env,
      ROBKIT_ADMIN_DATABASE_URL: adminUrl,
      ROBKIT_DB_SECRET: secret,
    },
  });
  const shared = new Map<string, string>([
    ["ROBKIT_ADMIN_DATABASE_URL", adminUrl],
    ["ROBKIT_DB_SECRET", secret],
  ]);
  for (const line of stdout.trim().split("\n")) {
    const at = line.indexOf("=");
    shared.set(line.slice(0, at), line.slice(at + 1));
  }
  // Caddy stands in for Cloudflare's tunnel, as on R's hosts.
  const deployments = await deploymentOf(stack.dir, {
    domain,
    port: stack.port,
    trustedProxy: "cloudflare",
  });
  return new Map(
    deployments.map(({ slug, env }) => [
      slug,
      Object.fromEntries(
        Object.entries(env).map(([key, value]) => {
          if ("literal" in value) return [key, value.literal];
          const found = shared.get(value.shared);
          if (found === undefined) throw new Error(`${value.shared} is unset`);
          return [key, found];
        }),
      ),
    ]),
  );
}

/**
 * Starts `slug`'s container, replacing any running one, as a deploy does.
 * It trusts Caddy's CA, as a container on Coolify trusts real certificates.
 */
export async function startApp(
  stack: Stack,
  slug: string,
  env: Record<string, string>,
): Promise<void> {
  const container = `${stack.name}-${slug}`;
  await docker("rm", "-f", container).catch(() => undefined);
  await docker(
    "run",
    "-d",
    "--label",
    stack.name,
    "--network",
    network,
    "--name",
    container,
    "--network-alias",
    slug,
    "-v",
    `${join(stack.caDir, "root.crt")}:/ca.crt:ro`,
    "-e",
    "NODE_EXTRA_CA_CERTS=/ca.crt",
    ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    `${stack.name}/${slug}`,
  );
}

/** What `slug` answers at `path` over https through Caddy. */
function status(stack: Stack, slug: string, path: string): Promise<number> {
  const host = stack.addresses.host(slug);
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port: stack.port,
        servername: host,
        path,
        headers: { host: `${host}:${String(stack.port)}` },
        rejectUnauthorized: false,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    )
      .on("error", reject)
      .end();
  });
}

/**
 * Each of the stack's containers with its state and the end of its logs,
 * for a failed journey to print beside what the browser saw.
 */
export async function stackReport(stack: Stack): Promise<string> {
  const containers = (
    await docker(
      "ps",
      "-a",
      "--filter",
      `label=${stack.name}`,
      "--format",
      "{{.Names}}\t{{.Status}}",
    )
  )
    .split("\n")
    .filter(Boolean);
  const reports = await Promise.all(
    containers.map(async (line) => {
      const [container = ""] = line.split("\t");
      const logs = await run("docker", ["logs", "--tail", "40", container])
        .then(({ stdout, stderr }) => stdout + stderr)
        .catch((error: unknown) => String(error));
      return `${line}\n${logs}`;
    }),
  );
  return reports.join("\n");
}

/** Waits until `slug` answers `path` with `expected`, naming its logs if not. */
export async function answers(
  stack: Stack,
  slug: string,
  expected: number,
  path = "/",
): Promise<void> {
  const deadline = Date.now() + 120_000;
  let last: number | string;
  for (;;) {
    last = await status(stack, slug, path).catch((error: unknown) =>
      String(error),
    );
    if (last === expected) return;
    if (Date.now() > deadline) {
      const logs = await run("docker", ["logs", `${stack.name}-${slug}`])
        .then(({ stdout, stderr }) => stdout + stderr)
        .catch(() => "");
      throw new Error(
        `${slug} answered ${String(last)}, not ${String(expected)}:\n${logs}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** One sign-in attempt by a visitor, with any headers it adds itself. */
export interface Attempt {
  password: string;
  headers?: Record<string, string>;
}

/** Someone on their own address, signing in at core through Caddy. */
export interface Visitor {
  /** Makes each attempt in turn and gets each answer's status. */
  signsIn: (attempts: Attempt[]) => Promise<number[]>;
}

/**
 * Runs `use` with `count` visitors, each a container of its own on the
 * stack's network. They all run until `use` is done, so Docker gives each
 * its own address and Caddy sees them as Cloudflare sees different people.
 */
export async function withVisitors<T>(
  stack: Stack,
  count: number,
  use: (visitors: Visitor[]) => Promise<T>,
): Promise<T> {
  const containers = Array.from(
    { length: count },
    (_, i) => `${stack.name}-visitor-${String(i + 1)}`,
  );
  for (const container of containers) {
    await docker(
      "run",
      "-d",
      "--label",
      stack.name,
      "--network",
      network,
      "--name",
      container,
      "-v",
      `${join(stack.caDir, "root.crt")}:/ca.crt:ro`,
      "-e",
      "NODE_EXTRA_CA_CERTS=/ca.crt",
      "--entrypoint",
      "sleep",
      `${stack.name}/core`,
      "600",
    );
  }
  const login = `${stack.addresses.origin("core")}/login`;
  const signsIn = async (container: string, attempts: Attempt[]) => {
    const script = `
const statuses = [];
for (const { password, headers } of ${JSON.stringify(attempts)}) {
  const res = await fetch(${JSON.stringify(login)}, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ username: "owner", password }),
  });
  await res.arrayBuffer();
  statuses.push(res.status);
}
console.log(JSON.stringify(statuses));
`;
    const output = await docker(
      "exec",
      container,
      "node",
      "--input-type=module",
      "-e",
      script,
    );
    return JSON.parse(output.trim().split("\n").at(-1) ?? "[]") as number[];
  };
  try {
    return await use(
      containers.map((container) => ({
        signsIn: (attempts) => signsIn(container, attempts),
      })),
    );
  } finally {
    await docker("rm", "-f", ...containers).catch(() => undefined);
  }
}
