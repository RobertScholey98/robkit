import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonObject, stringsIn } from "../json.ts";

const manifest = join(import.meta.dirname, "../../package.json");

/**
 * The version robkit's packages are at in this checkout. They release
 * together at one version, so create-robkit's own is every package's. A
 * test that named the number would fail on the pull request that changes it.
 */
export const robkitVersion =
  stringsIn(jsonObject(readFileSync(manifest, "utf8"), manifest)).version ?? "";

/** A version after {@link robkitVersion}, its patch one higher. */
export const newerVersion = robkitVersion.replace(
  /^(\d+\.\d+\.)(\d+)$/,
  (_, start: string, patch: string) => `${start}${String(Number(patch) + 1)}`,
);
