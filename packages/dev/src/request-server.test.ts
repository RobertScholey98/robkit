import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
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
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { privateFolder, serveRequests } from "./request-server.ts";
import {
  askDev,
  devRunning,
  devSocket,
  socketFolderIsOwn,
  type Answered,
  type DevRequest,
  type DevSocket,
} from "./requests.ts";

/** A home folder of the test's own, so nothing writes in the real one. */
function home(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-home-"));
}

/** A new install's folder. */
function installDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-install-"));
}

/**
 * An install's folder, and a home of its own, for one test, with the
 * socket's folder in it, as a `pnpm dev` that ran there left it.
 */
async function place(): Promise<{
  root: string;
  env: NodeJS.ProcessEnv;
  socket: DevSocket;
}> {
  const root = await installDir();
  const env = { HOME: await home() };
  const socket = await devSocket(root, env);
  await mkdir(socket.folder, { recursive: true, mode: 0o700 });
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

  // A home is 755 on older Ubuntu and on WSL's first account, 750 on newer
  // Ubuntu, macOS and CI's runner, and 700 for root.
  it.each([0o755, 0o750, 0o700])(
    "listens in a home of mode %o, in folders only this account can open",
    async (mode) => {
      const root = await installDir();
      const env = { HOME: await home() };
      await chmod(env.HOME, mode);
      const socket = await devSocket(root, env);
      await serving(socket);

      const answer = await askDev(
        root,
        { operation: "add", slug: slug("notes") },
        env,
      );

      expect(answer).toEqual({ outcome: "done", message: "add notes" });
      expect([
        (await stat(socket.parent)).mode & 0o777,
        (await stat(socket.folder)).mode & 0o777,
      ]).toEqual([0o700, 0o700]);
    },
  );

  it("answers a terminal whose XDG_RUNTIME_DIR and TMPDIR differ from the runner's", async () => {
    const root = await installDir();
    const HOME = await home();
    vi.stubEnv("TMPDIR", await mkdtemp(join(tmpdir(), "robkit-tmp-")));
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    await serving(
      await devSocket(root, { HOME, XDG_RUNTIME_DIR: "/mnt/wslg/runtime-dir" }),
    );
    // As a macOS terminal app sets it, where an ssh session sets neither.
    vi.stubEnv("TMPDIR", "/var/folders/xy/T");

    const answer = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      { HOME },
    );

    expect(answer).toEqual({ outcome: "done", message: "add notes" });
  });

  it("answers only for its own install, though another is a copy of it", async () => {
    const env = { HOME: await home() };
    const original = await installDir();
    await mkdir(join(original, ".robkit"));
    const copy = join(await installDir(), "copy");
    await cp(original, copy, { recursive: true });
    for (const [root, name] of [
      [original, "original"],
      [copy, "copy"],
    ] as const) {
      await serving(await devSocket(root, env), (request) =>
        Promise.resolve({
          outcome: "done",
          message: `${name} ${request.slug}`,
        }),
      );
    }

    const answers = await Promise.all(
      [original, copy].map((root) =>
        askDev(root, { operation: "add", slug: slug("notes") }, env),
      ),
    );

    expect(answers).toEqual([
      { outcome: "done", message: "original notes" },
      { outcome: "done", message: "copy notes" },
    ]);
  });

  it("listens in the folder run links to, which it checks in run's place", async () => {
    const root = await installDir();
    const env = { HOME: await home() };
    const shorter = await mkdtemp(join(tmpdir(), "r-"));
    await mkdir(join(env.HOME, ".robkit"), { mode: 0o700 });
    await symlink(shorter, join(env.HOME, ".robkit", "run"));
    const socket = await devSocket(root, env);
    await serving(socket);

    const answer = await askDev(
      root,
      { operation: "add", slug: slug("notes") },
      env,
    );

    expect(answer).toEqual({ outcome: "done", message: "add notes" });
    expect(socket.path.startsWith(`${shorter}/`)).toBe(true);
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

  it("gives the socket to one of two runners that start together, and refuses the other", async () => {
    const { root, env, socket } = await place();

    const started = await Promise.allSettled([
      serveRequests(socket, done),
      serveRequests(socket, done),
    ]);
    for (const each of started) {
      if (each.status === "fulfilled") onTestFinished(() => each.value.close());
    }

    expect(started.map((each) => each.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(started.find((each) => each.status === "rejected")).toMatchObject({
      reason: new CommandProblem(
        "pnpm dev is already running in this install. Use that one, or stop it before you start another.",
      ),
    });
    expect(
      await askDev(root, { operation: "add", slug: slug("notes") }, env),
    ).toEqual({ outcome: "done", message: "add notes" });
  });

  // Root writes in any folder.
  it.skipIf(process.getuid?.() === 0)(
    "fails with the system's own error when it can't make the socket file",
    async () => {
      const { socket } = await place();
      await chmod(socket.folder, 0o500);
      onTestFinished(() => chmod(socket.folder, 0o700));

      await expect(serveRequests(socket, done)).rejects.toMatchObject({
        code: "EACCES",
      });
    },
  );

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

  it("asks nothing of a socket in a folder others can open, where another account could answer", async () => {
    const { root, env, socket } = await place();
    let asked = 0;
    await impostorAt(socket.path, (connection) => {
      asked += 1;
      connection.end('{"outcome":"done","message":"Added."}\n');
    });
    await chmod(socket.folder, 0o777);

    const answer = askDev(root, { operation: "add", slug: slug("notes") }, env);

    await expect(answer).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${socket.folder}, which others can open (mode 777). Run chmod 700 ${socket.folder}, then run pnpm dev again.`,
      ),
    );
    expect(asked).toBe(0);
  });

  it("asks nothing of a socket under a .robkit others can open, where another account could swap run", async () => {
    const { root, env, socket } = await place();
    let asked = 0;
    await impostorAt(socket.path, (connection) => {
      asked += 1;
      connection.end('{"outcome":"done","message":"Added."}\n');
    });
    await chmod(socket.parent, 0o777);

    const answer = askDev(root, { operation: "add", slug: slug("notes") }, env);

    await expect(answer).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which others can open (mode 777). Run chmod 700 ${socket.parent}, then run pnpm dev again.`,
      ),
    );
    expect(asked).toBe(0);
  });

  it("stops reading an answer with no line break at 64 KB, as a fault", async () => {
    const { root, env, socket } = await place();
    await impostorAt(socket.path, (connection) => {
      // askDev closes the connection while this is still being sent.
      connection.on("error", () => undefined);
      connection.write("x".repeat(70 * 1024));
    });

    const answer = askDev(root, { operation: "add", slug: slug("notes") }, env);

    await expect(answer).rejects.toThrow(
      `pnpm dev sent over 64 KB at ${socket.path} with no line break, which is no answer.`,
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

  it("doesn't say for a socket in a folder others can open, where another account could answer", async () => {
    const { root, env, socket } = await place();
    await serving(socket);
    await chmod(socket.folder, 0o755);

    await expect(devRunning(root, env)).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${socket.folder}, which others can open (mode 755). Run chmod 700 ${socket.folder}, then try again.`,
      ),
    );
  });

  it("doesn't say for a socket under a .robkit others can open", async () => {
    const { root, env, socket } = await place();
    await serving(socket);
    await chmod(socket.parent, 0o755);

    await expect(devRunning(root, env)).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which others can open (mode 755). Run chmod 700 ${socket.parent}, then try again.`,
      ),
    );
  });
});

// The check askDev and devRunning make before they connect, as another
// account sees this account's folders.
describe.skipIf(process.platform === "win32")("socketFolderIsOwn", () => {
  const someoneElse = Number(process.getuid?.()) + 1;

  it("refuses a .robkit another account owns", async () => {
    const { socket } = await place();

    const checked = socketFolderIsOwn(socket, {
      owner: someoneElse,
      again: "try again",
    });

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which another account owns. Remove it, with sudo if you need to, then try again.`,
      ),
    );
  });

  it("says no runner is there when .robkit isn't", async () => {
    const socket = await devSocket(await installDir(), { HOME: await home() });

    expect(await socketFolderIsOwn(socket)).toBe(false);
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
  /** Where pnpm dev keeps its socket under a home of the test's own. */
  async function socketIn(HOME: string) {
    return devSocket(await installDir(), { HOME });
  }

  it("makes .robkit and run in the home, each only this account can open", async () => {
    const socket = await socketIn(await home());

    await privateFolder(socket);

    expect([
      (await stat(socket.parent)).mode & 0o777,
      (await stat(socket.folder)).mode & 0o777,
    ]).toEqual([0o700, 0o700]);
  });

  it("says when it can't make the folder, as in a home that is a file", async () => {
    const file = join(await home(), "a-file");
    await writeFile(file, "");
    const socket = await socketIn(file);

    const made = privateFolder(socket);

    await expect(made).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${socket.parent}, and couldn't make that folder (ENOTDIR). Make it yourself, with mode 700, then run pnpm dev again.`,
      ),
    );
  });

  // Root writes in any folder.
  it.skipIf(process.getuid?.() === 0)(
    "says when it can't make the folder in a home it can't write in",
    async () => {
      const HOME = await home();
      await chmod(HOME, 0o500);
      onTestFinished(() => chmod(HOME, 0o700));
      const socket = await socketIn(HOME);

      const made = privateFolder(socket);

      await expect(made).rejects.toThrow(
        new CommandProblem(
          `pnpm dev keeps its socket in ${socket.parent}, and couldn't make that folder (EACCES). Make it yourself, with mode 700, then run pnpm dev again.`,
        ),
      );
    },
  );

  it("refuses a run folder others can open", async () => {
    const socket = await socketIn(await home());
    await mkdir(socket.folder, { recursive: true, mode: 0o700 });
    await chmod(socket.folder, 0o755);

    const checked = privateFolder(socket);

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${socket.folder}, which others can open (mode 755). Run chmod 700 ${socket.folder}, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a .robkit others can open, and makes nothing in it", async () => {
    const socket = await socketIn(await home());
    await mkdir(socket.parent, { mode: 0o777 });
    await chmod(socket.parent, 0o777);

    const checked = privateFolder(socket);

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which others can open (mode 777). Run chmod 700 ${socket.parent}, then run pnpm dev again.`,
      ),
    );
    expect(existsSync(socket.folder)).toBe(false);
  });

  it("refuses a .robkit another account owns", async () => {
    const socket = await socketIn(await home());
    // As another account sees this account's folder.
    const someoneElse = Number(process.getuid?.()) + 1;

    const checked = privateFolder(socket, { owner: someoneElse });

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which another account owns. Remove it, with sudo if you need to, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a link in .robkit's place", async () => {
    const HOME = await home();
    await symlink(await home(), join(HOME, ".robkit"));
    const socket = await socketIn(HOME);

    const checked = privateFolder(socket);

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket under ${socket.parent}, which isn't a folder. Remove it, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a file in run's place", async () => {
    const HOME = await home();
    await mkdir(join(HOME, ".robkit"), { mode: 0o700 });
    await writeFile(join(HOME, ".robkit", "run"), "");
    const socket = await socketIn(HOME);

    const checked = privateFolder(socket);

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${socket.folder}, which isn't a folder. Remove it, then run pnpm dev again.`,
      ),
    );
  });

  it("refuses a folder run links to that others can open, naming it", async () => {
    const HOME = await home();
    const target = await mkdtemp(join(tmpdir(), "r-"));
    await chmod(target, 0o755);
    await mkdir(join(HOME, ".robkit"), { mode: 0o700 });
    await symlink(target, join(HOME, ".robkit", "run"));
    const socket = await socketIn(HOME);

    const checked = privateFolder(socket);

    await expect(checked).rejects.toThrow(
      new CommandProblem(
        `pnpm dev keeps its socket in ${target}, which others can open (mode 755). Run chmod 700 ${target}, then run pnpm dev again.`,
      ),
    );
  });

  it("makes the folder run links to when it is gone, as after a restart", async () => {
    const HOME = await home();
    const gone = join(await mkdtemp(join(tmpdir(), "r-")), "gone");
    await mkdir(join(HOME, ".robkit"), { mode: 0o700 });
    await symlink(gone, join(HOME, ".robkit", "run"));
    const socket = await socketIn(HOME);

    await privateFolder(socket);

    expect((await stat(gone)).mode & 0o777).toBe(0o700);
  });

  it("leaves folders of its own as they are", async () => {
    const socket = await socketIn(await home());
    await mkdir(socket.folder, { recursive: true, mode: 0o700 });

    await privateFolder(socket);

    expect((await stat(socket.folder)).mode & 0o777).toBe(0o700);
  });
});
