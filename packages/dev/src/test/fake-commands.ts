import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What a fake command prints and exits with, by its first argument. */
export type FakeAnswers = Record<string, { output: string; code: number }>;

// Each fake is this script, run by this Node, answering from its JSON file.
const script = `const { appendFileSync, readFileSync } = require("node:fs");
const [, , ...args] = process.argv;
const name = process.env.ROBKIT_FAKE_NAME;
const dir = process.env.ROBKIT_FAKE_DIR;
appendFileSync(dir + "/calls.log", [name, ...args].join(" ") + "\\n");
const answers = JSON.parse(readFileSync(dir + "/" + name + ".json", "utf8"));
const answer = answers[args[0]] ?? { output: "", code: 0 };
process.stdout.write(answer.output + "\\n");
process.exit(answer.code);
`;

/**
 * A folder holding fake commands, such as `pnpm` and `docker`, that answer
 * as `commands` says and log each call. Put it alone on `PATH` with
 * {@link envWithPath}.
 */
export async function fakeCommands(
  commands: Record<string, FakeAnswers>,
): Promise<{ dir: string; calls: () => Promise<string[]> }> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-fake-commands-"));
  await writeFile(join(dir, "fake.cjs"), script);
  await writeFile(join(dir, "calls.log"), "");
  for (const [name, answers] of Object.entries(commands)) {
    await writeFile(join(dir, `${name}.json`), JSON.stringify(answers));
    const node = process.execPath;
    const fake = join(dir, "fake.cjs");
    if (process.platform === "win32") {
      await writeFile(
        join(dir, `${name}.cmd`),
        `@set ROBKIT_FAKE_NAME=${name}\r\n@set "ROBKIT_FAKE_DIR=${dir}"\r\n@"${node}" "${fake}" %*\r\n`,
      );
    } else {
      const file = join(dir, name);
      await writeFile(
        file,
        `#!/bin/sh\nROBKIT_FAKE_NAME=${name} ROBKIT_FAKE_DIR='${dir}' exec '${node}' '${fake}' "$@"\n`,
      );
      await chmod(file, 0o755);
    }
  }
  const calls = async () =>
    (await readFile(join(dir, "calls.log"), "utf8"))
      .split("\n")
      .filter(Boolean);
  return { dir, calls };
}

/** This process's environment with `dir` as the whole `PATH`. */
export function envWithPath(dir: string): NodeJS.ProcessEnv {
  // Windows spells it Path; drop every spelling so only one is left.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"),
  );
  return { ...env, PATH: dir };
}
