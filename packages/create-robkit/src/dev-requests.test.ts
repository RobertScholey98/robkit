import { once } from "node:events";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { devSocket } from "@robkit/dev/cli";
import { describe, expect, it, type TestContext } from "vitest";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { drive } from "./test/drive.ts";
import { installsPnpm, pathAhead } from "./test/path.ts";

const bin = fileURLToPath(new URL("robkit-command.ts", import.meta.url));

/**
 * A written install with its dependencies in, as far as robkit add can
 * tell, and the environment robkit runs in: a pnpm that installs nothing,
 * and an XDG_RUNTIME_DIR of the test's own for pnpm dev's socket.
 */
async function installedInstall() {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir, { install: false });
  await mkdir(join(dir, "node_modules"));
  const env = await pathAhead({ pnpm: await installsPnpm() }, process.env);
  env.XDG_RUNTIME_DIR = await mkdtemp(join(tmpdir(), "robkit-run-"));
  return { dir, env };
}

/**
 * A stand-in for a running pnpm dev in the install at `dir`: it answers
 * every request with `answer`, and records each line it was sent, until
 * the test whose context it gets ends. The tests in a file run side by
 * side, so the hook must be that test's own.
 */
async function runnerAnswering(
  { onTestFinished }: Pick<TestContext, "onTestFinished">,
  dir: string,
  env: NodeJS.ProcessEnv,
  answer: { outcome: string; message: string },
): Promise<string[]> {
  const { path } = await devSocket(dir, env);
  const asked: string[] = [];
  const server = createServer((connection) => {
    connection.setEncoding("utf8");
    let line = "";
    connection.on("data", (chunk: string) => {
      line += chunk;
      if (!line.endsWith("\n")) return;
      asked.push(line);
      connection.end(`${JSON.stringify(answer)}\n`);
    });
  }).listen(path);
  await once(server, "listening");
  onTestFinished(() => {
    server.close();
  });
  return asked;
}

describe.skipIf(process.platform === "win32")(
  "robkit add with pnpm dev running",
  () => {
    it("tells pnpm dev, and prints the address it answers with", async (context) => {
      const { dir, env } = await installedInstall();
      const asked = await runnerAnswering(context, dir, env, {
        outcome: "done",
        message:
          "pnpm dev started notes at http://notes.robkit.localhost:3400.",
      });

      const { code, output } = await drive(
        bin,
        dir,
        ["add", "notes", "--stack", "react-hono"],
        [],
        env,
      );

      expect(asked).toEqual(['{"operation":"add","slug":"notes"}\n']);
      expect({ code, output: output.split("\n").slice(-2) }).toEqual({
        code: 0,
        output: [
          "Added apps/notes. pnpm dev started notes at http://notes.robkit.localhost:3400.",
          "",
        ],
      });
    });

    it("prints the problem pnpm dev answers with, and how to start the app", async (context) => {
      const { dir, env } = await installedInstall();
      await runnerAnswering(context, dir, env, {
        outcome: "refused",
        message: "notes exited with 1 before it answered.",
      });

      const { code, output } = await drive(
        bin,
        dir,
        ["add", "notes", "--stack", "react-hono"],
        [],
        env,
      );

      expect(code).toBe(1);
      expect(output).toContain(
        `Added apps/notes, but pnpm dev couldn't start it:

  notes exited with 1 before it answered.

Fix that, then stop pnpm dev and start it again, which starts every app in apps/.
`,
      );
    });
  },
);

describe("robkit add with no pnpm dev running", () => {
  it("says to run pnpm dev", async () => {
    const { dir, env } = await installedInstall();

    const { code, output } = await drive(
      bin,
      dir,
      ["add", "notes", "--stack", "react-hono"],
      [],
      env,
    );

    expect({ code, output: output.split("\n").slice(-6) }).toEqual({
      code: 0,
      output: [
        "Added apps/notes. Next:",
        "",
        "  pnpm dev",
        "",
        "Then open http://notes.robkit.localhost:3000.",
        "",
      ],
    });
  });
});

describe.skipIf(process.platform === "win32")("robkit migrate", () => {
  it("asks pnpm dev to migrate the app, and prints its answer", async (context) => {
    const { dir, env } = await installedInstall();
    const asked = await runnerAnswering(context, dir, env, {
      outcome: "done",
      message: "pnpm dev migrated example.",
    });

    const { code, output } = await drive(
      bin,
      dir,
      ["migrate", "example"],
      [],
      env,
    );

    expect(asked).toEqual(['{"operation":"migrate","slug":"example"}\n']);
    expect({ code, output }).toEqual({
      code: 0,
      output: "pnpm dev migrated example.\n",
    });
  });

  it("prints the problem pnpm dev answers with", async (context) => {
    const { dir, env } = await installedInstall();
    await runnerAnswering(context, dir, env, {
      outcome: "refused",
      message: "pnpm dev isn't running gamma.",
    });

    const { code, output } = await drive(
      bin,
      dir,
      ["migrate", "gamma"],
      [],
      env,
    );

    expect({ code, output }).toEqual({
      code: 1,
      output: "pnpm dev isn't running gamma.\n",
    });
  });
});

describe("robkit migrate with no pnpm dev running", () => {
  it("says to start pnpm dev, which migrates", async () => {
    const { dir, env } = await installedInstall();

    const { code, output } = await drive(
      bin,
      dir,
      ["migrate", "example"],
      [],
      env,
    );

    expect({ code, output }).toEqual({
      code: 0,
      output:
        "No pnpm dev is running in this install. Start it with pnpm dev, which migrates every app as it starts.\n",
    });
  });

  it.each([
    [[], "Usage: robkit migrate <slug>"],
    [["My_App"], `"My_App" can't be an app's slug`],
    [["example", "more"], "Usage: robkit migrate <slug>"],
  ])("refuses %j", async (args, message) => {
    const { dir, env } = await installedInstall();

    const { code, output } = await drive(
      bin,
      dir,
      ["migrate", ...args],
      [],
      env,
    );

    expect(code).toBe(1);
    expect(output).toContain(message);
  });
});
