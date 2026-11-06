import { execFile } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort, removeWhenGone } from "@internal/test-postgres";
import { orThrow, readDomain } from "@robkit/input";
import { install, type Install } from "@robkit/input/addresses";

// The production host's lifecycle: its network, Postgres and Caddy.
// production-apps.ts builds and starts the apps on it, and
// production-checks.ts holds what the test asks of it.

const run = promisify(execFile);

/** A domain no real host answers, so the stack can't reach the internet. */
export const domain = orThrow(readDomain({}, "robkit.test"));

/**
 * Prefixes and labels everything the stack makes: its network, containers
 * and images.
 */
export const stackName = `robkit-prod-${String(process.pid)}`;

/** The stack's network, named under its prefix. */
export const network = `${stackName}-network`;

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

/** Runs the Docker CLI, answering with what it printed. */
export async function docker(...args: string[]): Promise<string> {
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
  // A network another run already removed is fine.
  await docker("network", "rm", network).catch(() => undefined);
}
