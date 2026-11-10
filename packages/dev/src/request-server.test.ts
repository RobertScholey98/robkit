import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { slug } from "@internal/test-session";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it, onTestFinished } from "vitest";
import { privateFolder, serveRequests } from "./request-server.ts";
import {
  askDev,
  devRunning,
  devSocket,
  type Answered,
  type DevRequest,
  type DevSocket,
} from "./requests.ts";

/**
 * An install's folder, and an XDG_RUNTIME_DIR of its own, for one test,
 * with the socket's folder in it, as a `pnpm dev` that ran there left it.
 */
async function place(): Promise<{
  root: string;
  env: NodeJS.ProcessEnv;
  socket: DevSocket;
}> {
  const root = await mkdtemp(join(tmpdir(), "robkit-install-"));
  const env = { XDG_RUNTIME_DIR: await mkdtemp(join(tmpdir(), "robkit-run-")) };
  const socket = await devSocket(root, env);
  await mkdir(socket.folder, { mode: 0o700 });
  return { root, env, socket };
}

type Handle = (request: DevRequest) => Promise<Answered>;

const done: Handle = (request) =>
  Promise.resolve({
    outcome: "done",
    message: `${request.operation} ${request.slug}`,
  });

/** Serves requests at `socket` with `handle`, until the test ends. */
async function serving(
  socket: DevSocket,
  handle: Handle = done,
  received?: (request: DevRequest) => void,
) {
  const server = await serveRequests(socket, handle, {
    report: () => undefined,
    ...(received && { received }),
  });
  onTestFinished(() => server.close());
  return server;
}

/** Sends `bytes` as they are, and resolves with the line that comes back. */
function sendRaw(path: string, bytes: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const connection = connect(path);
    let answer = "";
    connection.on("data", (chunk: Buffer) => {
      answer += chunk.toString();
      if (answer.includes("\n")) {
        connection.destroy();
        resolve(answer);
      }
    });
    connection.on("error", (error) => {
      // The runner may close a connection that sent too much once it has
      // answered. The answer still arrives first.
      if (!answer.includes("\n")) reject(error);
    });
    connection.write(bytes);
  });
}

/** A socket file whose listener was killed, as a killed `pnpm dev` leaves. */
async function staleSocketAt(path: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require("node:net").createServer().listen(${JSON.stringify(path)}, () => console.log("up"))`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await once(child.stdout, "data");
  child.kill("SIGKILL");
  await once(child, "exit");
}

describe.skipIf(process.platform === "win32")("serveRequests", () => {
  it("answers a request with what the runner made of it", async () => {
    const { root, env, socket } = await place();
    await serving(socket);

    const answer = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(answer).toEqual({ outcome: "done", message: "add notes" });
  });

  it.each([
    [
      "an operation it doesn't know",
      '{"operation":"remove","slug":"notes"}\n',
      'pnpm dev doesn\'t know the operation "remove". It knows add and migrate.',
    ],
    [
      "a slug that fails the slug rule",
      '{"operation":"add","slug":"Notes"}\n',
      `"Notes" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    [
      "a line that isn't JSON",
      "add notes\n",
      'pnpm dev takes one line of JSON, such as {"operation":"add","slug":"notes"}.',
    ],
    [
      "a line over 1 KB",
      `{"operation":"add","slug":"notes"}${" ".repeat(1024)}\n`,
      "pnpm dev takes a request of at most 1024 bytes.",
    ],
  ])("refuses %s with a reason, and goes on serving", async (_, line, why) => {
    const { root, env, socket } = await place();
    const asked: DevRequest[] = [];
    await serving(socket, (request) => {
      asked.push(request);
      return done(request);
    });

    const refused: unknown = JSON.parse(await sendRaw(socket.path, line));
    const next = await askDev(
      root,
      { operation: "migrate", slug: slug("notes") },
      env,
    );

    expect(refused).toEqual({ outcome: "refused", message: why });
    expect(next).toEqual({ outcome: "done", message: "migrate notes" });
    expect(asked).toEqual([{ operation: "migrate", slug: "notes" }]);
  });

  it("takes a line of 1024 bytes", async () => {
    const { socket } = await place();
    await serving(socket);
    const request = '{"operation":"add","slug":"notes"}';

    const answer: unknown = JSON.parse(
      await sendRaw(socket.path, `${request.padEnd(1024)}\n`),
    );

    expect(answer).toEqual({ outcome: "done", message: "add notes" });
  });

  it("takes what was sent before the connection's end as the line", async () => {
    const { socket } = await place();
    await serving(socket);

    const answer = await new Promise<string>((resolve, reject) => {
      let received = "";
      connect(socket.path)
        .on("data", (chunk: Buffer) => (received += chunk.toString()))
        .on("end", () => {
          resolve(received);
        })
        .on("error", reject)
        .end('{"operation":"add","slug":"notes"}');
    });

    expect(JSON.parse(answer) as unknown).toEqual({
      outcome: "done",
      message: "add notes",
    });
  });

  it("runs a request whose asker went away, and goes on serving", async () => {
    const { root, env, socket } = await place();
    const asked = Promise.withResolvers<undefined>();
    const gone = Promise.withResolvers<undefined>();
    const handled: string[] = [];
    await serving(
      socket,
      async (request) => {
        await gone.promise;
        handled.push(`${request.operation} ${request.slug}`);
        return done(request);
      },
      () => {
        asked.resolve(undefined);
      },
    );

    const asker = connect(socket.path);
    asker.write('{"operation":"add","slug":"notes"}\n');
    await asked.promise;
    asker.destroy();
    await once(asker, "close");
    gone.resolve(undefined);
    const next = await askDev(
      root,
      { operation: "migrate", slug: slug("notes") },
      env,
    );

    expect({ handled, next }).toEqual({
      handled: ["add notes", "migrate notes"],
      next: { outcome: "done", message: "migrate notes" },
    });
  });

  it("closes a connection that ends having sent nothing, and goes on serving", async () => {
    const { root, env, socket } = await place();
    await serving(socket);

    const empty = connect(socket.path).end();
    await once(empty, "close");
    const next = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(next).toEqual({ outcome: "done", message: "add notes" });
  });

  it("refuses a line over 1 KB without waiting for the rest of it", async () => {
    const { socket } = await place();
    await serving(socket);

    // 2 KB with no line break, and the connection left open: a runner
    // that read the whole line first would never answer.
    const answer: unknown = JSON.parse(
      await sendRaw(socket.path, "x".repeat(2048)),
    );

    expect(answer).toEqual({
      outcome: "refused",
      message: "pnpm dev takes a request of at most 1024 bytes.",
    });
  });

  it("handles one request at a time, in the order they arrive", async () => {
    const { root, env, socket } = await place();
    const started: string[] = [];
    const first = Promise.withResolvers<undefined>();
    const firstStarted = Promise.withResolvers<undefined>();
    const secondWaits = Promise.withResolvers<undefined>();
    await serving(
      socket,
      async (request) => {
        started.push(request.slug);
        if (request.slug === "first") {
          firstStarted.resolve(undefined);
          await first.promise;
        }
        return done(request);
      },
      (request) => {
        if (request.slug === "second") secondWaits.resolve(undefined);
      },
    );

    const asking = askDev(root, { operation: "add", slug: slug("first") }, env);
    await firstStarted.promise;
    const second = askDev(
      root,
      { operation: "add", slug: slug("second") },
      env,
    );
    await secondWaits.promise;
    const startedWhileFirstRan = [...started];
    first.resolve(undefined);

    expect(await asking).toEqual({ outcome: "done", message: "add first" });
    expect(await second).toEqual({ outcome: "done", message: "add second" });
    expect(startedWhileFirstRan).toEqual(["first"]);
    expect(started).toEqual(["first", "second"]);
  });

  it("answers a request whose handling failed, saying so, and goes on serving", async () => {
    const { root, env, socket } = await place();
    const reported: unknown[] = [];
    const server = await serveRequests(
      socket,
      (request) =>
        request.slug === "broken"
          ? Promise.reject(new Error("broke on purpose"))
          : done(request),
      { report: (message, cause) => reported.push(message, cause) },
    );
    onTestFinished(() => server.close());

    const broken = await askDev(
      root,
      { operation: "add", slug: slug("broken") },
      env,
    );
    const next = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(broken).toEqual({
      outcome: "refused",
      message: "pnpm dev hit a bug in robkit. Its output says what failed.",
    });
    expect(next).toEqual({ outcome: "done", message: "add notes" });
    expect(reported).toEqual([
      "robkit hit a bug while pnpm dev handled add broken. Report it at https://github.com/RobertScholey98/robkit/issues, with the error below.",
      new Error("broke on purpose"),
    ]);
  });

  it("listens where others can open XDG_RUNTIME_DIR, as they can WSLg's, in a folder they can't", async () => {
    const root = await mkdtemp(join(tmpdir(), "robkit-install-"));
    const runtime = await mkdtemp(join(tmpdir(), "robkit-run-"));
    await chmod(runtime, 0o777);
    const env = { XDG_RUNTIME_DIR: runtime };
    const socket = await devSocket(root, env);
    await serving(socket);

    const answer = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(answer).toEqual({ outcome: "done", message: "add notes" });
    expect((await stat(socket.folder)).mode & 0o777).toBe(0o700);
  });

  it("removes a socket file a killed run left, and listens there", async () => {
    const { root, env, socket } = await place();
    await staleSocketAt(socket.path);

    await serving(socket);

    expect(
      await askDev(root, { operation: "add", slug: slug("notes") }, env),
    ).toEqual({ outcome: "done", message: "add notes" });
  });

  it("refuses to take the socket of a runner that answers there, which keeps it", async () => {
    const { root, env, socket } = await place();
    await serving(socket);

    const second = serveRequests(socket, done);

    await expect(second).rejects.toThrow(
      new CommandProblem(
        "pnpm dev is already running in this install. Use that one, or stop it before you start another.",
      ),
    );
    expect(
      await askDev(root, { operation: "add", slug: slug("notes") }, env),
    ).toEqual({ outcome: "done", message: "add notes" });
  });

  it("removes its socket file when it stops", async () => {
    const { root, env, socket } = await place();
    const server = await serveRequests(socket, done);

    await server.close();

    expect(existsSync(socket.path)).toBe(false);
    expect(
      await askDev(root, { operation: "add", slug: slug("notes") }, env),
    ).toEqual({ outcome: "not-running" });
  });
});

describe.skipIf(process.platform === "win32")("askDev", () => {
  it("says no pnpm dev is running when there is no socket", async () => {
    const { root, env } = await place();

    expect(
      await askDev(root, { operation: "add", slug: slug("notes") }, env),
    ).toEqual({ outcome: "not-running" });
  });

  it("says within a second that no pnpm dev is running when a killed run left its socket", async () => {
    const { root, env, socket } = await place();
    await staleSocketAt(socket.path);
    const started = performance.now();

    const answer = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(answer).toEqual({ outcome: "not-running" });
    expect(existsSync(socket.path)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each([
    "not an answer\n",
    "[]\n",
    '{"outcome":"done"}\n',
    '{"outcome":"maybe","message":"Added."}\n',
  ])("refuses the answer %j as a fault", async (sent) => {
    const { root, env, socket } = await place();
    await impostorAt(socket.path, (connection) => connection.end(sent));

    const answer = askDev(root, { operation: "add", slug: slug("notes") }, env);

    await expect(answer).rejects.toThrow(
      `pnpm dev answered at ${socket.path} with something robkit doesn't read.`,
    );
  });

  it("refuses a connection closed with no answer, as a fault", async () => {
    const { root, env, socket } = await place();
    await impostorAt(socket.path, (connection) => connection.end());

    const answer = askDev(root, { operation: "add", slug: slug("notes") }, env);

    await expect(answer).rejects.toThrow(
      `pnpm dev closed the connection at ${socket.path} unanswered.`,
    );
  });

  // Root opens any folder.
  it.skipIf(process.getuid?.() === 0)(
    "refuses a socket in a folder it can't open, as a fault",
    async () => {
      const { root, env, socket } = await place();
      await impostorAt(socket.path, (connection) => connection.end());
      await chmod(socket.folder, 0o000);
      onTestFinished(() => chmod(socket.folder, 0o700));

      const answer = askDev(
        root,
        { operation: "add", slug: slug("notes") },
        env,
      );

      await expect(answer).rejects.toThrow(
        `robkit couldn't ask pnpm dev at ${socket.path}.`,
      );
    },
  );
});

describe.skipIf(process.platform === "win32")("devRunning", () => {
  it("says pnpm dev runs while a runner answers on the socket, and sends it nothing", async () => {
    const { root, env, socket } = await place();
    const asked: DevRequest[] = [];
    await serving(socket, done, (request) => asked.push(request));

    expect(await devRunning(root, env)).toBe(true);
    expect(asked).toEqual([]);
  });

  it("says no pnpm dev runs when there is no socket", async () => {
    const { root, env } = await place();

    expect(await devRunning(root, env)).toBe(false);
  });

  it("says no pnpm dev runs when a killed run left its socket", async () => {
    const { root, env, socket } = await place();
    await staleSocketAt(socket.path);

    expect(await devRunning(root, env)).toBe(false);
  });
});

describe("devRunning on native Windows", () => {
  it("says no pnpm dev runs, without looking for a socket", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    onTestFinished(() => {
      if (platform) Object.defineProperty(process, "platform", platform);
    });
    // devSocket would fail on this folder, which doesn't exist.
    const root = join(await mkdtemp(join(tmpdir(), "robkit-")), "missing");

    expect(await devRunning(root, {})).toBe(false);
  });
});

/** Something listening at `path` that isn't pnpm dev, until the test ends. */
async function impostorAt(
  path: string,
  answer: (connection: Socket) => void,
): Promise<void> {
  const impostor = createServer(answer).listen(path);
  await once(impostor, "listening");
  onTestFinished(() => {
    impostor.close();
  });
}

describe.skipIf(process.platform === "win32")("privateFolder", () => {
  it("makes the folder only this account can open", async () => {
    const folder = join(await mkdtemp(join(tmpdir(), "robkit-")), "robkit-0");

    await privateFolder({ folder, setBy: "TMPDIR" });

    expect((await stat(folder)).mode & 0o777).toBe(0o700);
  });

  it("says when it can't make the folder", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "robkit-")), "a-file");
    await writeFile(file, "");
    const folder = join(file, "robkit-0");

    const made = privateFolder({ folder, setBy: "TMPDIR" });

    await expect(made).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${folder}, and couldn't make that folder (ENOTDIR). Point TMPDIR at a folder you can write to, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a folder others can open", async () => {
    const folder = await mkdtemp(join(tmpdir(), "robkit-run-"));
    await chmod(folder, 0o755);

    const checked = privateFolder({ folder, setBy: "XDG_RUNTIME_DIR" });

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${folder}, which others can open (mode 755). Run chmod 700 ${folder}, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a folder another account owns", async () => {
    const folder = await mkdtemp(join(tmpdir(), "robkit-run-"));
    // As another account sees this account's folder.
    const someoneElse = Number(process.getuid?.()) + 1;

    const checked = privateFolder(
      { folder, setBy: "TMPDIR" },
      { owner: someoneElse },
    );

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${folder}, which another account owns. Point TMPDIR at a folder of your own, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a link in the folder's place", async () => {
    const target = await mkdtemp(join(tmpdir(), "robkit-run-"));
    const folder = join(await mkdtemp(join(tmpdir(), "robkit-")), "robkit-0");
    await symlink(target, folder);

    const checked = privateFolder({ folder, setBy: "TMPDIR" });

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${folder}, which isn't a folder. Remove it, then run pnpm dev again.`,
      ),
    );
  });

  it("leaves a folder of its own as it is", async () => {
    const parent = await mkdtemp(join(tmpdir(), "robkit-"));
    const folder = join(parent, "robkit-0");
    await mkdir(folder, { mode: 0o700 });

    await privateFolder({ folder, setBy: "TMPDIR" });

    expect((await stat(folder)).mode & 0o777).toBe(0o700);
  });
});
