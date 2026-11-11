import { createHash } from "node:crypto";

// What robkit deploy records on an application once its deploy finished:
// the commit robkit ran from and a hash of the variables it saved, as one
// value. It lives in the application's description, which Coolify returns
// with each application and leaves out of what a deploy builds and runs.

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

const shape =
  /^robkit deployed commit ([0-9a-f]{40}|[0-9a-f]{64}) with variables ([0-9a-f]{64})$/;

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
 * The record of a finished deploy, as the application's description. It
 * keeps to the letters Coolify allows in a description.
 */
export function recordOf(commit: string, variables: string): string {
  return `robkit deployed commit ${commit} with variables ${variables}`;
}

/** The record in an application's description, if it holds one. */
export function readRecord(description: unknown): DeployRecord {
  if (description === undefined || description === null) {
    return { outcome: "none" };
  }
  if (typeof description !== "string") return { outcome: "unreadable" };
  if (description.trim() === "") return { outcome: "none" };
  const found = shape.exec(description.trim());
  if (!found?.[1] || !found[2]) return { outcome: "unreadable" };
  return { outcome: "recorded", commit: found[1], variables: found[2] };
}
