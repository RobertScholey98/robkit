import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Settings git reads from the environment, which a test sets its own way. */
const gitSettings =
  /^(GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL)|GIT_CONFIG_.*|EMAIL|HOME|USERPROFILE|XDG_CONFIG_HOME)$/i;

/**
 * This process's environment, with git reading no config file but an
 * empty one. With `identity`, git has a name and email from the
 * environment, as a test that commits needs. Without it, git refuses to
 * guess one, as on a machine where nobody has set them.
 */
export async function gitEnv(identity: boolean): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "robkit-home-"));
  const config = join(home, ".gitconfig");
  await writeFile(config, "");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !gitSettings.test(key)),
  );
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: config,
    ...(identity
      ? {
          GIT_AUTHOR_NAME: "Robkit Test",
          GIT_AUTHOR_EMAIL: "test@robkit.localhost",
          GIT_COMMITTER_NAME: "Robkit Test",
          GIT_COMMITTER_EMAIL: "test@robkit.localhost",
        }
      : {
          // Without it, git makes up an email from the user and host names.
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "user.useConfigOnly",
          GIT_CONFIG_VALUE_0: "true",
        }),
  };
}
