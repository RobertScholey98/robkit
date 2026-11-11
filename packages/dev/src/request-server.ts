import { mkdir, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { isProblem } from "@robkit/input";
import { CommandProblem, reportFaultsAt } from "@robkit/input/command";
import { type Report, reportToConsole } from "@robkit/input/report";
import { hasCode } from "./files.ts";
import {
  answersAt,
  type Answered,
  type DevRequest,
  type DevSocket,
  maxRequestBytes,
  readDevRequest,
  socketFolderIsOwn,
} from "./requests.ts";

/** Makes `folder` for this account alone, unless something is there. */
async function makeOwn(folder: string): Promise<void> {
  try {
    await mkdir(folder, { mode: 0o700 });
  } catch (error) {
    if (hasCode(error, "EEXIST")) return;
    // The folder it goes in is missing, or isn't this account's to write
    // in, as a home can be for an account that runs a daemon.
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "no error code";
    throw new CommandProblem(
      `pnpm dev keeps its socket in ${folder}, and couldn't make that folder (${code}). Make it yourself, with mode 700, then run pnpm dev again.`,
      { cause: error },
    );
  }
}

/**
 * Makes `.robkit` in the account's home, and the folder `socket` is in,
 * each for this account alone, unless it is there, and checks that only
 * this account can open them, as {@link socketFolderIsOwn} does for the
 * commands that ask.
 *
 * @param owner the account that must own them, this process's by default
 * @throws a {@link CommandProblem} for a folder it can't make, that isn't
 *   one, that another account owns, or that others can open
 */
export async function privateFolder(
  socket: Pick<DevSocket, "parent" | "folder">,
  options: { owner?: number | undefined } = {},
): Promise<void> {
  await makeOwn(socket.parent);
  // `.robkit` first, before anything goes in it.
  await socketFolderIsOwn(socket, options);
  await makeOwn(socket.folder);
  await socketFolderIsOwn(socket, options);
}

/** How long a connection gets to send its request before it is closed. */
const readTimeoutMs = 10_000;

/** A running `pnpm dev`'s socket, listening. */
export interface RequestServer {
  /**
   * Stops listening, waits for the request in hand to be answered, closes
   * every connection and removes the socket file.
   */
  close: () => Promise<void>;
}

export interface ServeOptions {
  /** Where a fault in `handle` is reported. */
  report?: Report;
  /** Told of each request as it takes its place in line. */
  received?: (request: DevRequest) => void;
}

/**
 * Listens for requests on `socket`'s file, in a folder only this account
 * can open. A file a killed run left is removed; one a running `pnpm dev`
 * answers on is left to it. Each connection sends one line of
 * at most {@link maxRequestBytes} bytes, and gets one line back. A line
 * that isn't a request is refused at once with the reason, and reading
 * stops at the limit. Requests go to `handle` one at a time, in the order
 * they arrive.
 *
 * @throws a {@link CommandProblem} for a folder others can open, or when a
 *   `pnpm dev` already answers on the socket
 */
export async function serveRequests(
  socket: DevSocket,
  handle: (request: DevRequest) => Promise<Answered>,
  { report = reportToConsole, received }: ServeOptions = {},
): Promise<RequestServer> {
  await privateFolder(socket);

  let queue = Promise.resolve();
  const open = new Set<Socket>();

  const answer = (connection: Socket, answered: Answered) => {
    connection.end(`${JSON.stringify(answered)}\n`, () => {
      connection.destroy();
    });
  };

  const handled = async (request: DevRequest): Promise<Answered> => {
    try {
      return await handle(request);
    } catch (error) {
      report(
        `robkit hit a bug while pnpm dev handled ${request.operation} ${request.slug}. Report it at ${reportFaultsAt}, with the error below.`,
        error,
      );
      return {
        outcome: "refused",
        message: "pnpm dev hit a bug in robkit. Its output says what failed.",
      };
    }
  };

  const take = (connection: Socket, line: string) => {
    const request = readDevRequest(line);
    if (isProblem(request)) {
      answer(connection, { outcome: "refused", message: request.error });
      return;
    }
    received?.(request);
    queue = queue.then(async () => {
      answer(connection, await handled(request));
    });
  };

  // Half open, so an asker that ends its side after the request still gets
  // the answer. Every answer ends the connection.
  const server = createServer({ allowHalfOpen: true }, (connection) => {
    open.add(connection);
    connection.on("close", () => open.delete(connection));
    connection.on("error", () => {
      // The asker went away. Its request, if it sent one, still runs, and
      // nobody is left to read the answer.
    });
    connection.setTimeout(readTimeoutMs, () => connection.destroy());
    const chunks: Buffer[] = [];
    let length = 0;
    const stopReading = () => {
      connection.off("data", onData);
      connection.off("end", onEnd);
      connection.pause();
      connection.setTimeout(0);
    };
    const onData = (chunk: Buffer) => {
      const lineEnd = chunk.indexOf("\n");
      const part = lineEnd === -1 ? chunk : chunk.subarray(0, lineEnd);
      // Keep no more than one byte past the limit, however much arrived.
      chunks.push(part.subarray(0, maxRequestBytes + 1 - length));
      length += part.length;
      if (length > maxRequestBytes) {
        stopReading();
        answer(connection, {
          outcome: "refused",
          message: `pnpm dev takes a request of at most ${String(maxRequestBytes)} bytes.`,
        });
        return;
      }
      if (lineEnd === -1) return;
      stopReading();
      take(connection, Buffer.concat(chunks).toString("utf8"));
    };
    // A request with no line break is the whole of what was sent.
    const onEnd = () => {
      stopReading();
      if (length === 0) connection.destroy();
      else take(connection, Buffer.concat(chunks).toString("utf8"));
    };
    connection.on("data", onData);
    connection.on("end", onEnd);
  });

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket.path, () => {
        server.off("error", reject);
        resolve();
      });
    });
  // Listening on the name is what takes it, so of two runners that start
  // together one gets it. A name that is taken, with nobody answering on
  // it, is a file a killed run left.
  try {
    await listen();
  } catch (error) {
    if (!hasCode(error, "EADDRINUSE")) throw error;
    if (await answersAt(socket.path)) {
      throw new CommandProblem(
        "pnpm dev is already running in this install. Use that one, or stop it before you start another.",
      );
    }
    await rm(socket.path, { force: true });
    await listen();
  }

  return {
    close: async () => {
      server.close();
      await queue;
      for (const connection of open) connection.destroy();
      await rm(socket.path, { force: true });
    },
  };
}
