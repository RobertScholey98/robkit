import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { withPathAhead } from "./path.ts";

/** What the fake pnpm does, which a test can change between runs. */
export interface FakePnpmSettings {
  /** What `pnpm view` prints as JSON, or `"fails"` for a 404. */
  view: unknown;
  /** Which `pnpm install`, counting from 1, fails, if any. */
  failInstall?: number;
  /** Whether `pnpm install` waits, once it has started, until it is killed. */
  holdInstall?: boolean;
  /** The robkit command `pnpm exec robkit` runs, with node. */
  robkit?: string;
}

/** The source robkit command, which `pnpm exec robkit` runs by default. */
const robkitBin = fileURLToPath(
  new URL("../robkit-command.ts", import.meta.url),
);

// The fake itself. It records each call, prints `view`, appends a line to
// pnpm-lock.yaml on each install, so a test sees the lockfile change, and
// runs the robkit command for `exec robkit`.
const fake = `import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const here = (name) => new URL(name, import.meta.url);
const settings = JSON.parse(readFileSync(here("settings.json"), "utf8"));
const args = process.argv.slice(2);
appendFileSync(here("calls.jsonl"), JSON.stringify(args) + "\\n");
const [command] = args;
if (command === "view") {
  if (settings.view === "fails") {
    console.log(JSON.stringify({ error: { code: "ERR_PNPM_FETCH_404", message: "GET https://registry.example/create-robkit: Not Found - 404" } }));
    process.exit(1);
  }
  console.log(JSON.stringify(settings.view));
} else if (command === "install") {
  const installs = readFileSync(here("calls.jsonl"), "utf8")
    .split("\\n").filter((line) => line.startsWith('["install"')).length;
  appendFileSync("pnpm-lock.yaml", "# install " + installs + "\\n");
  if (settings.holdInstall) {
    writeFileSync(here("holding"), String(process.pid));
    setInterval(() => {}, 1000);
  } else if (settings.failInstall === installs) {
    console.error("it failed");
    process.exit(1);
  }
} else if (command === "exec" && args[1] === "robkit") {
  const ran = spawnSync(process.execPath, [settings.robkit, ...args.slice(2)], { stdio: "inherit" });
  process.exit(ran.status ?? 1);
} else {
  console.error("The fake pnpm doesn't take " + args.join(" "));
  process.exit(1);
}
`;

/** A fake pnpm ahead of everything else on a PATH. */
export interface FakePnpm {
  /** The environment it is first on the PATH of. */
  env: NodeJS.ProcessEnv;
  /** Changes what it does from its next call on. */
  set(settings: FakePnpmSettings): Promise<void>;
  /** The arguments of each call it took, in order. */
  calls(): Promise<string[][]>;
  /** The pid of the `pnpm install` that `holdInstall` has waiting. */
  held(): Promise<number>;
}

/** A fake pnpm, first on `env`'s PATH, doing what `settings` say. */
export async function fakePnpm(
  settings: FakePnpmSettings,
  env: NodeJS.ProcessEnv,
): Promise<FakePnpm> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-pnpm-"));
  await writeFile(join(dir, "pnpm.mjs"), fake);
  await writeFile(join(dir, "calls.jsonl"), "");
  const script = join(dir, "pnpm.mjs");
  if (process.platform === "win32") {
    await writeFile(
      join(dir, "pnpm.cmd"),
      `@"${process.execPath}" "${script}" %*\r\n`,
    );
  } else {
    const shim = join(dir, "pnpm");
    await writeFile(
      shim,
      `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
    );
    await chmod(shim, 0o755);
  }
  const set = (next: FakePnpmSettings) =>
    writeFile(
      join(dir, "settings.json"),
      JSON.stringify({ robkit: robkitBin, ...next }),
    );
  await set(settings);
  return {
    env: withPathAhead(dir, env),
    set,
    calls: async () =>
      (await readFile(join(dir, "calls.jsonl"), "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    held: async () => {
      const holding = join(dir, "holding");
      for (;;) {
        const pid = existsSync(holding) ? await readFile(holding, "utf8") : "";
        if (pid !== "") return Number(pid);
        await delay(20);
      }
    },
  };
}
