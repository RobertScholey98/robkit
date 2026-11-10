import { lstat, mkdir, rm } from "node:fs/promises";
import { connect, createServer, type Socket } from "node:net";
import { isProblem } from "@robkit/input";
import { CommandProblem, reportFaultsAt } from "@robkit/input/command";
import { type Report, reportToConsole } from "@robkit/input/report";
import { hasCode } from "./files.ts";
import {
  type Answered,
  type DevRequest,
  type DevSocket,
  maxRequestBytes,
  readDevRequest,
} from "./requests.ts";

/**
 * Makes the folder `socket` is in, for this account alone, unless it is
 * there, and checks that only this account can open it. No browser can
 * reach a socket file, so the folder's mode is what keeps others out.
 *
 * @param owner the account that must own it, this process's by default
 * @throws a {@link CommandProblem} for a folder that isn't one, that
 *   another account owns, or that others can open
 */
export async function privateFolder(
  { folder, setBy }: Pick<DevSocket, "folder" | "setBy">,
  { owner = process.getuid?.() }: { owner?: number | undefined } = {},
): Promise<void> {
  try {
    await mkdir(folder, { mode: 0o700 });
  } catch (error) {
    if (!hasCode(error, "EEXIST")) {
      throw new Error(`robkit-dev couldn't make ${folder}.`, { cause: error });
    }
  }
  const stats = await lstat(folder);
  const where = `pnpm dev keeps its socket in ${folder}`;
  if (!stats.isDirectory()) {
    throw new CommandProblem(
      `${where}, which isn't a folder. Remove it, then run pnpm dev again.`,
    );
  }
  if (stats.uid !== owner) {
    throw new CommandProblem(
      `${where}, which another account owns. Point ${setBy} at a folder of your own, then run pnpm dev again.`,
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    const mode = (stats.mode & 0o777).toString(8);
    throw new CommandProblem(
      `${where}, which others can open (mode ${mode}). Run chmod 700 ${folder}, then run pnpm dev again.`,
    );
  }
}

/** Whether something takes a connection on the socket at `path`. */
function answersAt(path: string): Promise<boolean> {
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
 * can open. A file a killed run left is removed first; one a running
 * `pnpm dev` answers on is left to it. Each connection sends one line of
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
  if (await answersAt(socket.path)) {
    throw new CommandProblem(
      "pnpm dev is already running in this install. Use that one, or stop it before you start another.",
    );
  }
  await rm(socket.path, { force: true });

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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket.path, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    close: async () => {
      server.close();
      await queue;
      for (const connection of open) connection.destroy();
      await rm(socket.path, { force: true });
    },
  };
}
