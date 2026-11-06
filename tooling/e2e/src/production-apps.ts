import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Slug } from "@robkit/input";
import { deploymentOf } from "create-robkit";
import { docker, domain, network, type Stack } from "./production-stack.ts";

const run = promisify(execFile);

/** The host's Postgres admin URL, as the containers reach it. */
const adminUrl = "postgres://postgres:postgres@postgres:5432/robkit";

/** The install's database secret on this host. */
const secret = "the production e2e's database secret, 32+ characters";

/**
 * Builds `slug`'s image from the install's Dockerfile, as Coolify does.
 *
 * With `ROBKIT_BUILD_CACHE` set to a BuildKit cache backend, such as
 * `type=gha` on GitHub's runners, the build reads and writes its layers
 * there, one scope per app, so a run after one that built the same install
 * reuses them. Without it, the local Docker's own cache
 * serves, as it does between runs on a laptop.
 */
export async function buildApp(stack: Stack, slug: Slug): Promise<void> {
  const cache = process.env.ROBKIT_BUILD_CACHE;
  const scope = `scope=${slug}`;
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
  console.log(`${slug}: ${cachedSteps(stderr)}`);
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
  slug: Slug,
  env: Record<string, string>,
): Promise<void> {
  const container = `${stack.name}-${slug}`;
  // No container from an earlier run is fine.
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
