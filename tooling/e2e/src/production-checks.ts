import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Slug } from "@robkit/input";
import { docker, network, type Stack } from "./production-stack.ts";

const run = promisify(execFile);

/**
 * Every package in `slug`'s image, by name, such as `vite` or
 * `@robkit/core`, each once.
 */
export async function imagePackages(
  stack: Stack,
  slug: Slug,
): Promise<string[]> {
  const store = await docker(
    "run",
    "--rm",
    "--entrypoint",
    "ls",
    `${stack.name}/${slug}`,
    "/install/node_modules/.pnpm",
  );
  // pnpm keeps each package in a folder such as `vite@8.0.5_...` or
  // `@robkit+core@file+...`, with a scope's slash as a plus.
  return [
    ...new Set(
      [...store.matchAll(/^(@[^+@\s]+\+[^@\s]+|[^@\s]+)@/gm)].map(([, name]) =>
        (name ?? "").replace("+", "/"),
      ),
    ),
  ].sort();
}

/** The robkit packages in `slug`'s image, by name, such as `@robkit/core`. */
export async function robkitPackages(
  stack: Stack,
  slug: Slug,
): Promise<string[]> {
  return (await imagePackages(stack, slug)).filter((name) =>
    name.startsWith("@robkit/"),
  );
}

/**
 * Stops `slug`'s container as a redeploy does, with `docker stop`: SIGTERM,
 * then SIGKILL 10 seconds later. Answers with its exit code, which is 137
 * if Docker had to kill it, and the last line it printed.
 */
export async function stopApp(
  stack: Stack,
  slug: Slug,
): Promise<{ exitCode: number; lastLine: string }> {
  const container = `${stack.name}-${slug}`;
  await docker("stop", container);
  const exitCode = Number(
    await docker("inspect", "--format", "{{.State.ExitCode}}", container),
  );
  const lines = (await docker("logs", container)).trim().split("\n");
  return { exitCode, lastLine: lines.at(-1) ?? "" };
}

/**
 * The packages in `slug`'s image that nothing in production needs, as
 * `name@version`, found by `extraneous-packages.js` running in the image.
 */
export async function extraneousPackages(
  stack: Stack,
  slug: Slug,
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

/** What `slug` answers at `path` over https through Caddy. */
function status(stack: Stack, slug: Slug, path: string): Promise<number> {
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
  slug: Slug,
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
      // A container with no logs still gets its failure reported.
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
    signal: AbortSignal.timeout(10_000),
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
    const statuses: unknown = JSON.parse(
      output.trim().split("\n").at(-1) ?? "[]",
    );
    if (
      !Array.isArray(statuses) ||
      !statuses.every((status): status is number => typeof status === "number")
    ) {
      throw new Error(
        `The visitor container printed ${output}, not a list of statuses.`,
      );
    }
    return statuses;
  };
  try {
    return await use(
      containers.map((container) => ({
        signsIn: (attempts) => signsIn(container, attempts),
      })),
    );
  } finally {
    // Containers that never started have nothing to remove.
    await docker("rm", "-f", ...containers).catch(() => undefined);
  }
}
