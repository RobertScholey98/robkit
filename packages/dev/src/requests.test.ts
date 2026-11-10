import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isProblem } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it } from "vitest";
import { devSocket, readDevRequest } from "./requests.ts";

/** A new folder only this account can open, as XDG_RUNTIME_DIR often is. */
async function runtimeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-run-"));
}

/** The name of this account's own folder, in whichever folder holds it. */
const own = `robkit-${String(process.getuid?.())}`;

async function installDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "robkit-install-"));
}

describe.skipIf(process.platform === "win32")("devSocket", () => {
  it("puts the socket in a folder of this account's own in XDG_RUNTIME_DIR, named after the install", async () => {
    const run = await runtimeDir();
    const root = await installDir();

    const socket = await devSocket(root, { XDG_RUNTIME_DIR: run });

    const folder = join(run, own);
    expect({ folder: socket.folder, setBy: socket.setBy }).toEqual({
      folder,
      setBy: "XDG_RUNTIME_DIR",
    });
    expect(socket.path).toMatch(
      new RegExp(`^${folder}/robkit-[0-9a-f]{16}\\.sock$`),
    );
  });

  it("puts the socket in a folder of this account's own under the temp folder without XDG_RUNTIME_DIR", async () => {
    const root = await installDir();

    const socket = await devSocket(root, {});

    const folder = join(tmpdir(), own);
    expect({ folder: socket.folder, setBy: socket.setBy }).toEqual({
      folder,
      setBy: "TMPDIR",
    });
    expect(socket.path).toMatch(
      new RegExp(`^${folder}/robkit-[0-9a-f]{16}\\.sock$`),
    );
  });

  it("gives one install one path, however its folder is reached", async () => {
    const run = await runtimeDir();
    const root = await installDir();
    const link = join(await installDir(), "link");
    await symlink(root, link);

    const direct = await devSocket(root, { XDG_RUNTIME_DIR: run });
    const linked = await devSocket(link, { XDG_RUNTIME_DIR: run });

    expect(linked.path).toBe(direct.path);
  });

  it("gives two installs two paths", async () => {
    const run = await runtimeDir();

    const first = await devSocket(await installDir(), { XDG_RUNTIME_DIR: run });
    const second = await devSocket(await installDir(), {
      XDG_RUNTIME_DIR: run,
    });

    expect(first.path).not.toBe(second.path);
  });

  it("refuses a path of 100 bytes or more, naming the variable to change", async () => {
    const run = join(await runtimeDir(), "a".repeat(80));
    await mkdir(run);
    const root = await installDir();

    const socket = devSocket(root, { XDG_RUNTIME_DIR: run });

    await expect(socket).rejects.toThrow(CommandProblem);
    await expect(socket).rejects.toThrow(
      new RegExp(
        `^pnpm dev keeps its socket at ${run}/${own}/robkit-[0-9a-f]{16}\\.sock, which is \\d+ bytes, and a socket's path must be under 100\\. Point XDG_RUNTIME_DIR at a shorter folder, then run pnpm dev again\\.$`,
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
