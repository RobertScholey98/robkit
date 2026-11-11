import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { removeWhenGone } from "./clean-up.ts";

/**
 * Where tools find what a home holds besides the home itself: caches,
 * settings and downloaded toolchains, each with the folder it defaults to
 * under HOME.
 */
const keptInHome = {
  XDG_CACHE_HOME: ".cache",
  XDG_CONFIG_HOME: ".config",
  XDG_DATA_HOME: ".local/share",
  XDG_STATE_HOME: ".local/state",
  GOPATH: "go",
  DOCKER_CONFIG: ".docker",
} as const;

/** `name`'s value in `env`, or `fallback` where it is unset or empty. */
function setOr(env: NodeJS.ProcessEnv, name: string, fallback: string) {
  const value = env[name];
  return value?.length ? value : fallback;
}

/**
 * Variables that give a process a home of its own: HOME is a new folder,
 * removed once the test process has gone, so what `pnpm dev` writes in
 * the home, such as its socket's folder, never lands in the real one.
 * Docker, Corepack, pnpm and Go keep finding their settings and caches
 * where `env` does, so nothing is set up or downloaded again.
 */
export async function homeOfItsOwn(
  env: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const real = setOr(env, "HOME", homedir());
  const home = await mkdtemp(join(tmpdir(), "robkit-home-"));
  removeWhenGone({ path: home });
  const kept = Object.entries(keptInHome).map(
    ([name, under]): [string, string] => [
      name,
      setOr(env, name, join(real, under)),
    ],
  );
  return { ...Object.fromEntries(kept), HOME: home };
}
