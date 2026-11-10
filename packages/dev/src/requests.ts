// What a running `pnpm dev` can be asked, and where. The runner listens on
// a socket file, and the `robkit` command asks it: both work the socket's
// path out here, and both read a request with the one reader.

import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
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

/**
 * Checks that the folder `socket` is in is this account's alone. Whoever
 * can write in the folder can listen there, and whoever can open it can
 * ask, so its owner and mode are what say a runner there is this account's
 * and takes requests from nobody else. No browser can reach a socket file.
 *
 * @param owner the account that must own it, this process's by default
 * @param again what to do once it is put right, which ends the problem
 * @returns false when the folder isn't there
 * @throws a {@link CommandProblem} for a folder that isn't one, that
 *   another account owns, or that others can open
 */
export async function socketFolderIsOwn(
  { folder, setBy }: Pick<DevSocket, "folder" | "setBy">,
  {
    owner = process.getuid?.(),
    again = "run pnpm dev again",
  }: { owner?: number | undefined; again?: string } = {},
): Promise<boolean> {
  const where = `pnpm dev keeps its socket in ${folder}`;
  const stats = await lstat(folder).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (stats === undefined) return false;
  if (!stats.isDirectory()) {
    throw new CommandProblem(
      `${where}, which isn't a folder. Remove it, then ${again}.`,
    );
  }
  if (stats.uid !== owner) {
    throw new CommandProblem(
      `${where}, which another account owns. Point ${setBy} at a folder of your own, then ${again}.`,
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    const mode = (stats.mode & 0o777).toString(8);
    throw new CommandProblem(
      `${where}, which others can open (mode ${mode}). Run chmod 700 ${folder}, then ${again}.`,
    );
  }
  return true;
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
 *
 * @throws a {@link CommandProblem} when the socket's folder isn't this
 *   account's alone, since another account could then answer there
 */
export async function devRunning(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (process.platform === "win32") return false;
  const socket = await devSocket(root, env);
  if (!(await socketFolderIsOwn(socket, { again: "try again" }))) return false;
  return answersAt(socket.path);
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

/**
 * The longest answer `askDev` reads, in bytes. A runner's answer is a line
 * or a few, so more than this isn't one.
 */
const maxAnswerBytes = 64 * 1024;

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
 *   something that isn't an answer, and a {@link CommandProblem} when the
 *   socket's folder isn't this account's alone, since another account
 *   could then answer there
 */
export async function askDev(
  root: string,
  request: DevRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DevAnswer> {
  if (process.platform === "win32") return { outcome: "not-running" };
  const socket = await devSocket(root, env);
  if (!(await socketFolderIsOwn(socket))) return { outcome: "not-running" };
  const { path } = socket;
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
      if (end === -1) {
        if (Buffer.byteLength(received) > maxAnswerBytes) {
          settle(
            new Error(
              `pnpm dev sent over ${String(maxAnswerBytes / 1024)} KB at ${path} with no line break, which is no answer.`,
            ),
          );
        }
        return;
      }
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
