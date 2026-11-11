import { cp, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { isProblem } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { devSocket, readDevRequest } from "./requests.ts";

/** A home folder of the test's own, so nothing reads or writes the real one. */
async function home(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-home-"));
}

async function installDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-install-"));
}

const socketName = /^[0-9a-f]{16}\.sock$/;

describe.skipIf(process.platform === "win32")("devSocket", () => {
  it("puts the socket in .robkit/run in the account's home, named after the install", async () => {
    const HOME = await home();
    const root = await installDir();

    const socket = await devSocket(root, { HOME });

    expect({ parent: socket.parent, folder: socket.folder }).toEqual({
      parent: join(HOME, ".robkit"),
      folder: join(HOME, ".robkit", "run"),
    });
    expect(socket.path.slice(socket.folder.length + 1)).toMatch(socketName);
  });

  it("finds the same socket from terminals whose XDG_RUNTIME_DIR and TMPDIR differ", async () => {
    const HOME = await home();
    const root = await installDir();
    vi.stubEnv("TMPDIR", await mkdtemp(join(tmpdir(), "robkit-tmp-")));
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const runner = await devSocket(root, {
      HOME,
      XDG_RUNTIME_DIR: "/mnt/wslg/runtime-dir",
    });
    vi.stubEnv("TMPDIR", "/var/folders/xy/T");

    const command = await devSocket(root, { HOME });

    expect(command).toEqual(runner);
  });

  it("uses the account's own home where HOME isn't set", async () => {
    const root = await installDir();

    const socket = await devSocket(root, {});

    expect(socket.parent).toBe(join(userInfo().homedir, ".robkit"));
  });

  it("gives one install one path, however its folder is reached", async () => {
    const HOME = await home();
    const root = await installDir();
    const link = join(await installDir(), "link");
    await symlink(root, link);

    const direct = await devSocket(root, { HOME });
    const linked = await devSocket(link, { HOME });

    expect(linked.path).toBe(direct.path);
  });

  it("gives two installs two paths, though one is a copy of the other", async () => {
    const HOME = await home();
    const original = await installDir();
    const copy = join(await installDir(), "copy");
    await mkdir(join(original, ".robkit"));
    await cp(original, copy, { recursive: true });

    const first = await devSocket(original, { HOME });
    const second = await devSocket(copy, { HOME });

    expect(second.folder).toBe(first.folder);
    expect(second.path).not.toBe(first.path);
  });

  it("puts the socket in the folder run links to", async () => {
    const HOME = await home();
    const shorter = await mkdtemp(join(tmpdir(), "r-"));
    await mkdir(join(HOME, ".robkit"));
    await symlink(shorter, join(HOME, ".robkit", "run"));

    const socket = await devSocket(await installDir(), { HOME });

    expect({ parent: socket.parent, folder: socket.folder }).toEqual({
      parent: join(HOME, ".robkit"),
      folder: shorter,
    });
    expect(socket.path.slice(shorter.length + 1)).toMatch(socketName);
  });

  it("puts the socket in the folder run links to while that folder isn't there", async () => {
    const HOME = await home();
    const gone = join(await mkdtemp(join(tmpdir(), "r-")), "gone");
    await mkdir(join(HOME, ".robkit"));
    await symlink(gone, join(HOME, ".robkit", "run"));

    const socket = await devSocket(await installDir(), { HOME });

    expect(socket.folder).toBe(gone);
  });

  it("refuses a path of 100 bytes or more, naming it and the link that shortens it", async () => {
    const HOME = join(await home(), "a".repeat(80));
    const root = await installDir();

    const socket = devSocket(root, { HOME });

    const run = join(HOME, ".robkit", "run");
    await expect(socket).rejects.toThrow(CommandProblem);
    await expect(socket).rejects.toThrow(
      new RegExp(
        `^pnpm dev keeps its socket at ${run}/[0-9a-f]{16}\\.sock, which is \\d+ bytes, and a socket's path must be under 100\\. Make a folder only you can open at a shorter path, link ${run} to it, then run pnpm dev again\\.$`,
      ),
    );
  });
});

describe("readDevRequest", () => {
  it("reads an operation and a slug", () => {
    expect(readDevRequest('{"operation":"add","slug":"notes"}')).toEqual({
      operation: "add",
      slug: "notes",
    });
    expect(readDevRequest('{"operation":"migrate","slug":"notes"}')).toEqual({
      operation: "migrate",
      slug: "notes",
    });
  });

  it.each([
    [
      "not JSON",
      "add notes",
      'pnpm dev takes one line of JSON, such as {"operation":"add","slug":"notes"}.',
    ],
    [
      "JSON that isn't an object",
      '["add","notes"]',
      'pnpm dev takes one line of JSON, such as {"operation":"add","slug":"notes"}.',
    ],
    [
      "an operation it doesn't know",
      '{"operation":"remove","slug":"notes"}',
      'pnpm dev doesn\'t know the operation "remove". It knows add and migrate.',
    ],
    [
      "no operation",
      '{"slug":"notes"}',
      "A request to pnpm dev names an operation: add or migrate.",
    ],
    [
      "a slug that fails the slug rule",
      '{"operation":"add","slug":"../core"}',
      `"../core" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    ],
    [
      "anything beside the operation and the slug",
      '{"operation":"migrate","slug":"notes","command":"rm -rf /"}',
      'pnpm dev takes an operation and a slug, and nothing else. It doesn\'t take "command".',
    ],
  ])("refuses %s, saying why", (_, line, error) => {
    const request = readDevRequest(line);

    expect(isProblem(request) && request.error).toBe(error);
  });
});
