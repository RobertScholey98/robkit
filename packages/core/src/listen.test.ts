import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const slowServer = fileURLToPath(
  new URL("test/slow-server.ts", import.meta.url),
);

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (address === null || typeof address === "string") {
    throw new Error("The probe server has no port.");
  }
  return address.port;
}

/** Resolves once `text` has appeared in what `lines` collected. */
async function printed(lines: string[], text: string): Promise<void> {
  await expect.poll(() => lines.join(""), { timeout: 10_000 }).toContain(text);
}

// Windows has no SIGTERM to send: process.kill there ends the process.
describe.skipIf(process.platform === "win32")("listenUntilStopped", () => {
  it("lets a request open when SIGTERM arrives finish, then prints its line and exits 0", async () => {
    const port = await freePort();
    const server = spawn(process.execPath, [slowServer], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const output: string[] = [];
    server.stdout.on("data", (chunk: Buffer) => output.push(String(chunk)));
    const exited = once(server, "exit");
    const url = `http://127.0.0.1:${String(port)}`;
    await printed(output, `slow listening on 127.0.0.1:${String(port)}`);

    const slow = fetch(`${url}/slow`);
    await printed(output, "slow request open");
    server.kill("SIGTERM");

    // Stopping, it takes no new connection, and the open request goes on.
    await expect
      .poll(() =>
        fetch(`${url}/quick`).then(
          () => "answered",
          () => "refused",
        ),
      )
      .toBe("refused");
    expect(output.join("")).not.toContain("slow stopped");
    server.stdin.end("release\n");
    const response = await slow;

    expect({ status: response.status, body: await response.text() }).toEqual({
      status: 200,
      body: "finished",
    });
    expect(await exited).toEqual([0, null]);
    expect(output.join("")).toContain("slow stopped\n");
  });
});
