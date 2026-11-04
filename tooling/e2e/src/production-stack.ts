import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort, removeWhenGone } from "@internal/test-postgres";
import { packageManagerOf } from "@robkit/dev";
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

function caddyfile(port: number): string {
  return `{
  local_certs
  skip_install_trust
  https_port ${String(port)}
}

*.${domain} {
  tls internal
  reverse_proxy {labels.2}:3000
}
`;
}

/**
 * Starts the host for the install in `dir`. Caddy answers every name in
 * `slugs` inside the network too, so the apps reach core over https as
 * they would on Coolify.
 */
export async function startStack(dir: string, slugs: string[]): Promise<Stack> {
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

/** Builds `slug`'s image from the install's Dockerfile, as Coolify does. */
export async function buildApp(stack: Stack, slug: string): Promise<void> {
  await run(
    "docker",
    [
      "build",
      "--build-arg",
      `ROBKIT_APP=${slug}`,
      "-t",
      `${stack.name}/${slug}`,
      ".",
    ],
    { cwd: stack.dir, maxBuffer: 64 * 1024 * 1024 },
  );
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
  const pm = await packageManagerOf(stack.dir);
  const { stdout } = await run(pm, ["run", "robkit", "database-urls"], {
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
  const deployments = await deploymentOf(stack.dir, {
    domain,
    port: stack.port,
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
