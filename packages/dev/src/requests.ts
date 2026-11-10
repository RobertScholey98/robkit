// What a running `pnpm dev` can be asked, and where. The runner listens on
// a socket file, and the `robkit` command asks it: both work the socket's
// path out here, and both read a request with the one reader.

import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type InputProblem,
  isProblem,
  isRecord,
  parseJson,
  problem,
  readSlug,
  type Slug,
} from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { hasCode } from "./files.ts";

/** What a request asks a running `pnpm dev` to do for one app. */
export type DevOperation = "add" | "migrate";

const operations: readonly DevOperation[] = ["add", "migrate"];

/** A request to a running `pnpm dev`: an operation and a slug, nothing else. */
export interface DevRequest {
  operation: DevOperation;
  slug: Slug;
}

/** Where a running `pnpm dev` listens for requests. */
export interface DevSocket {
  /** The folder it is in, which the runner makes for this account alone. */
  folder: string;
  /** The socket file. */
  path: string;
  /** The variable that names the folder `folder` is in. */
  setBy: "XDG_RUNTIME_DIR" | "TMPDIR";
}

/** macOS takes no socket path of 104 bytes or more, so robkit keeps under 100. */
const maxPathBytes = 100;

/**
 * Where `pnpm dev` in the install at `root` listens for requests: in a
 * folder of this account's own, in `XDG_RUNTIME_DIR` where `env` sets it
 * and in the temp folder where it doesn't. The socket is named after a
 * hash of the install's real path, so two installs never share one. It
 * reads the folder's path and makes nothing.
 *
 * The folder is robkit's own even in `XDG_RUNTIME_DIR`, since not every
 * system keeps that one private: under WSL without systemd it is
 * `/mnt/wslg/runtime-dir`, which every account can open.
 *
 * @throws a {@link CommandProblem} when the path is 100 bytes or more
 */
export async function devSocket(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<DevSocket> {
  const runtime = env.XDG_RUNTIME_DIR;
  // An empty XDG_RUNTIME_DIR names no folder.
  const [within, setBy] = runtime
    ? ([runtime, "XDG_RUNTIME_DIR"] as const)
    : ([tmpdir(), "TMPDIR"] as const);
  const folder = join(within, `robkit-${String(process.getuid?.())}`);
  const hash = createHash("sha256")
    .update(await realpath(root))
    .digest("hex")
    .slice(0, 16);
  const path = join(folder, `robkit-${hash}.sock`);
  const bytes = Buffer.byteLength(path);
  if (bytes >= maxPathBytes) {
    throw new CommandProblem(
      `pnpm dev keeps its socket at ${path}, which is ${String(bytes)} bytes, and a socket's path must be under ${String(maxPathBytes)}. Point ${setBy} at a shorter folder, then run pnpm dev again.`,
    );
  }
  return { folder, path, setBy };
}

/** Whether something takes a connection on the socket at `path`. */
export function answersAt(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = connect(path);
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", (error) => {
      probe.destroy();
      // No file, or one nothing listens on, as a killed run leaves.
      if (hasCode(error, "ENOENT", "ECONNREFUSED")) resolve(false);
      else {
        reject(
          new Error(`robkit-dev couldn't check ${path}.`, { cause: error }),
        );
      }
    });
  });
}

/**
 * Whether a `pnpm dev` runs in the install at `root`: whether something
 * takes a connection on its socket. It sends nothing. No socket file, or
 * one a killed run left, is no, as is native Windows, where pnpm dev
 * doesn't run.
 */
export async function devRunning(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (process.platform === "win32") return false;
  return answersAt((await devSocket(root, env)).path);
}

/**
 * What a running `pnpm dev` answered: done or refused, with a line saying
 * which, or that none is running.
 */
export type DevAnswer =
  | { outcome: "done"; message: string }
  | { outcome: "refused"; message: string }
  | { outcome: "not-running" };

/** An answer a runner sends: every {@link DevAnswer} but "not-running". */
export type Answered = Exclude<DevAnswer, { outcome: "not-running" }>;

/** The longest request a runner reads, in bytes, its line break aside. */
export const maxRequestBytes = 1024;

/**
 * How long `askDev` waits for an answer. An add installs nothing, but it
 * migrates the app and waits for it and core to answer, and a request may
 * wait for one before it.
 */
const answerTimeoutMs = 10 * 60_000;

/** One line a runner answered, as an answer, or undefined if it isn't one. */
function readAnswered(line: string): Answered | undefined {
  const parsed = parseJson(line, "the answer");
  if (isProblem(parsed) || !isRecord(parsed.json)) return undefined;
  const { outcome, message } = parsed.json;
  if (typeof message !== "string") return undefined;
  if (outcome === "done" || outcome === "refused") return { outcome, message };
  return undefined;
}

/**
 * Asks the `pnpm dev` running in the install at `root` to do `request`,
 * and waits for its answer. No socket file, or one a killed run left, is
 * "not-running" at once, as it is on Windows, where pnpm dev doesn't run.
 *
 * @throws when the runner doesn't answer in time, or answers with
 *   something that isn't an answer
 */
export async function askDev(
  root: string,
  request: DevRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DevAnswer> {
  if (process.platform === "win32") return { outcome: "not-running" };
  const { path } = await devSocket(root, env);
  return new Promise((resolve, reject) => {
    const connection = connect(path);
    connection.setEncoding("utf8");
    let received = "";
    const timer = setTimeout(() => {
      connection.destroy();
      reject(
        new CommandProblem(
          `pnpm dev didn't answer within ${String(answerTimeoutMs / 60_000)} minutes. Look at its output for why.`,
        ),
      );
    }, answerTimeoutMs);
    const settle = (answer: DevAnswer | Error) => {
      clearTimeout(timer);
      connection.destroy();
      if (answer instanceof Error) reject(answer);
      else resolve(answer);
    };
    connection.on("connect", () => {
      connection.write(`${JSON.stringify(request)}\n`);
    });
    connection.on("data", (chunk: string) => {
      received += chunk;
      const end = received.indexOf("\n");
      if (end === -1) return;
      const answer = readAnswered(received.slice(0, end));
      settle(
        answer ??
          new Error(
            `pnpm dev answered at ${path} with something robkit doesn't read.`,
          ),
      );
    });
    connection.on("end", () => {
      settle(
        new Error(`pnpm dev closed the connection at ${path} unanswered.`),
      );
    });
    connection.on("error", (error) => {
      // No socket file, or one nothing listens on, as a killed run leaves:
      // no pnpm dev is running.
      if (hasCode(error, "ENOENT", "ECONNREFUSED")) {
        settle({ outcome: "not-running" });
        return;
      }
      settle(
        new Error(`robkit couldn't ask pnpm dev at ${path}.`, {
          cause: error,
        }),
      );
    });
  });
}

const shape =
  'pnpm dev takes one line of JSON, such as {"operation":"add","slug":"notes"}.';

/** One line sent to a running `pnpm dev`, as a request, or why it won't do. */
export function readDevRequest(line: string): DevRequest | InputProblem {
  const parsed = parseJson(line, "the request");
  if (isProblem(parsed) || !isRecord(parsed.json)) return problem(shape);
  const { operation, slug, ...rest } = parsed.json;
  const [extra] = Object.keys(rest);
  if (extra !== undefined) {
    return problem(
      `pnpm dev takes an operation and a slug, and nothing else. It doesn't take ${JSON.stringify(extra)}.`,
    );
  }
  const known = operations.find((name) => name === operation);
  if (operation === undefined) {
    return problem(
      `A request to pnpm dev names an operation: ${operations.join(" or ")}.`,
    );
  }
  if (known === undefined) {
    return problem(
      `pnpm dev doesn't know the operation ${JSON.stringify(operation)}. It knows ${operations.join(" and ")}.`,
    );
  }
  const read = readSlug(slug);
  if (isProblem(read)) return read;
  return { operation: known, slug: read };
}
