import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { orExit, readServeEnv } from "@robkit/input";
import { noSniff } from "@robkit/input/headers";
import serveStatic from "serve-static";
import { start, type RequestHandler } from "./listen.ts";

/** A folder of files, and the path its files are answered under. */
export interface Files {
  /** The path, such as `/assets`, or `/` for the root. */
  at: string;
  /**
   * The folder, such as `dist/assets`. A relative one is found from the
   * folder the server runs in, which the container sets.
   */
  folder: string;
}

/** What every server can be told: its name, and what to do once it stops. */
export interface ServerOptions {
  /** The server's name in the lines it prints. `server` unless set. */
  name?: string;
  /** Runs once the server has stopped, before its last line, such as closing a database. */
  onStopped?: () => Promise<void>;
}

export interface ServeOptions extends ServerOptions {
  /**
   * The folders of files answered before the app, in order. A request for
   * a file that isn't there goes on to the next folder, then the app.
   */
  files?: readonly Files[];
  /** Where to listen. `HOST` and `PORT` unless set. */
  address?: { host: string; port: number };
}

/** Express's shape for one step: answer, or hand the request on. */
type Step = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * Answers a GET or HEAD for a file in `folder` under `at`, and hands on
 * every other request. A path that climbs out of the folder, encoded or
 * not, gets no file, nor does a dotfile or a folder.
 */
function filesAt({ at, folder }: Files): Step {
  const answer = serveStatic(folder, { index: false, redirect: false });
  const prefix = at.endsWith("/") ? at : `${at}/`;
  return (request, response, next) => {
    // A server request always has one.
    const url = String(request.url);
    if (!url.startsWith(prefix)) {
      next();
      return;
    }
    // serve-static finds the file from the URL's path, so it sees the
    // path under `at`, and the app gets the URL as it came.
    request.url = url.slice(prefix.length - 1);
    answer(request, response, (error?: unknown) => {
      request.url = url;
      next(error);
    });
  };
}

/**
 * The two answers serve-static gives for a file it found and won't send: a
 * precondition that failed, and a range the file doesn't have. It hands
 * each on as an error, before it has sent anything.
 */
const refusals = new Set([412, 416]);

/** What serve-static hands on for one of {@link refusals}. */
interface Refusal {
  statusCode: number;
  /** A 416's `Content-Range`, which says how long the file is. */
  headers?: Record<string, string>;
}

function isRefusal(error: unknown): error is Refusal {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    refusals.has(error.statusCode)
  );
}

/** `app` behind `files`, with `headers` on every answer. */
function withFiles(
  app: RequestHandler,
  files: readonly Files[],
  headers: readonly (readonly [string, string])[],
): RequestHandler {
  const steps = files.map(filesAt);
  return (request, response) => {
    for (const [name, value] of headers) response.setHeader(name, value);
    return new Promise((resolve, reject) => {
      // A file sent settles nothing, as serve-static calls on only to
      // hand the request on, so the answer's end does.
      response.once("close", resolve);
      const from =
        (index: number) =>
        (error?: unknown): void => {
          const step = steps[index];
          if (isRefusal(error)) {
            // The client asked for what the file can't give, which is no
            // fault of the app's. The answer has no body, so the file's
            // type isn't its own.
            response.removeHeader("content-type");
            response.writeHead(error.statusCode, error.headers).end();
          } else if (error !== undefined) {
            reject(
              new Error("serve-static couldn't send a file.", { cause: error }),
            );
          } else if (step) step(request, response, from(index + 1));
          else {
            // serve-static calls this from a file system callback, after
            // the outer promise's start has returned. A throw from the app
            // there would be caught by nothing and end the process, so the
            // app runs at the start of a promise of its own.
            resolve(
              new Promise((answered) => {
                answered(app(request, response));
              }),
            );
          }
        };
      from(0)();
    });
  };
}

/**
 * Serves `app` behind `files` on `HOST` and `PORT`, or `address`, with
 * `nosniff` on every answer. It refuses a malformed `HOST` or `PORT` with
 * the reader's message and exits 1. On SIGTERM it stops as
 * `listenUntilStopped` does, then exits 0.
 *
 * @returns the server, which has started to listen
 */
export function serve(app: RequestHandler, options: ServeOptions = {}): Server {
  return serveWith(app, options, [noSniff]);
}

/** `serve`, with `headers` on every answer in place of `nosniff` alone. */
export function serveWith(
  app: RequestHandler,
  options: ServeOptions,
  headers: readonly (readonly [string, string])[],
): Server {
  const {
    files = [],
    name = "server",
    onStopped = () => Promise.resolve(),
  } = options;
  const { host, port } = options.address ?? orExit(readServeEnv(process.env));
  const { server, stopped } = start(withFiles(app, files, headers), {
    hostname: host,
    port,
    name,
    onStopped,
  });
  stopped.then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `${name} couldn't listen on ${host}:${String(port)}.`,
        error,
      );
      process.exit(1);
    },
  );
  return server;
}
