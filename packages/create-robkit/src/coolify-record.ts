import { createHash } from "node:crypto";

// What robkit deploy records on an application once its deploy finished:
// the commit Coolify built and a hash of the variables robkit saved, as one
// value. Before it queues a deploy, robkit puts a note that one started in
// the record's place, so a deploy it gives up on leaves no record that
// could say the app is unchanged. Both live in the application's
// description, which Coolify returns with each application and leaves out
// of what a deploy builds and runs.

/** A variable as robkit deploy saves it on an application. */
export interface SavedVariable {
  key: string;
  value: string;
  is_buildtime: boolean;
}

/** What an application's record says. */
export type DeployRecord =
  | { outcome: "recorded"; commit: string; variables: string }
  | { outcome: "none" }
  | { outcome: "unreadable" };

// A full commit hash, as SHA-1 or SHA-256.
const commit = "[0-9a-f]{40}|[0-9a-f]{64}";
const commitShape = new RegExp(`^(?:${commit})$`);
const shape = new RegExp(
  `^robkit deployed commit (${commit}) with variables ([0-9a-f]{64})$`,
);
const startedShape = new RegExp(
  `^robkit started a deploy from commit (?:${commit})$`,
);

/**
 * `value` as a full commit hash in lower case, or undefined when it isn't
 * one, such as the `HEAD` a deployment holds until Coolify resolves it.
 */
export function fullCommit(value: string | undefined): string | undefined {
  const lower = value?.trim().toLowerCase() ?? "";
  return commitShape.test(lower) ? lower : undefined;
}

/**
 * A hash of the variables robkit saves on an application, the same
 * whatever order they come in. A value that refers to a shared variable
 * holds its name, so no secret goes into the hash.
 */
export function variablesHash(variables: readonly SavedVariable[]): string {
  const sorted = [...variables]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, value, is_buildtime }) => [key, value, is_buildtime]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * The record of a finished deploy, as the application's description: the
 * commit Coolify built and the hash of the variables it ran with. It keeps
 * to the letters Coolify allows in a description.
 */
export function recordOf(commit: string, variables: string): string {
  return `robkit deployed commit ${commit} with variables ${variables}`;
}

/**
 * What an application's description says from before robkit queues a
 * deploy of it until that deploy's record is saved. `commit` is the one
 * robkit ran from, for a person reading it on Coolify.
 */
export function startedOf(commit: string): string {
  return `robkit started a deploy from commit ${commit}`;
}

/**
 * The record in an application's description, if it holds one. A note that
 * a deploy started is no record: nothing says that deploy finished.
 */
export function readRecord(description: unknown): DeployRecord {
  if (description === undefined || description === null) {
    return { outcome: "none" };
  }
  if (typeof description !== "string") return { outcome: "unreadable" };
  if (description.trim() === "") return { outcome: "none" };
  if (startedShape.test(description.trim())) return { outcome: "none" };
  const found = shape.exec(description.trim());
  if (!found?.[1] || !found[2]) return { outcome: "unreadable" };
  return { outcome: "recorded", commit: found[1], variables: found[2] };
}
