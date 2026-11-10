// The release workflow's publish step refuses to start without the token.
// publish-list.test.ts covers what it decides and how it publishes.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("release-publish.ts", () => {
  it.each([undefined, ""])(
    "stops before it reads npm or publishes anything when NPM_TOKEN is %j",
    (token) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NPM_TOKEN: token };
      if (token === undefined) delete env.NPM_TOKEN;
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        ["release-publish.ts"],
        { cwd: import.meta.dirname, env, encoding: "utf8" },
      );

      expect(status).toBe(1);
      expect(stdout).toBe("");
      expect(stderr.trim()).toBe(
        'NPM_TOKEN is missing, so nothing was published. Add it as a secret of the release environment, as CONTRIBUTING.md\'s "Releasing" says, then run the release again.',
      );
    },
  );
});
