// Every stack robkit can make runs the whole-stack journeys on every pull
// request. The e2e suite makes an install for each ready stack by itself,
// but a stack's journeys run only from its own test file,
// tooling/e2e/src/<stack>.test.ts, which Vitest runs beside the others.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isMissing } from "@robkit/dev/cli";

/** Where the whole-stack test keeps each stack's file, from the repo root. */
export const journeysFile = (stack: string) =>
  `tooling/e2e/src/${stack}.test.ts`;

/**
 * What's wrong with each stack's whole-stack test file, given each file's
 * text by stack, or undefined for a file that isn't there.
 */
export function stackJourneyProblems(
  files: ReadonlyMap<string, string | undefined>,
): string[] {
  return [...files].flatMap(([stack, text]) => {
    const file = journeysFile(stack);
    const call = `describeJourneys(${JSON.stringify(stack)}`;
    if (text === undefined) {
      return [
        `${stack} is a ready stack with no ${file}, so CI runs no journeys on it. Add the file, calling ${call}).`,
      ];
    }
    return text.includes(call)
      ? []
      : [`${file} doesn't call ${call}), so CI runs no journeys on ${stack}.`];
  });
}

/** Each stack's whole-stack test file under `root`, by stack. */
export async function readStackJourneys(
  root: string,
  stacks: readonly string[],
): Promise<Map<string, string | undefined>> {
  return new Map(
    await Promise.all(
      stacks.map(
        async (stack) =>
          [
            stack,
            await readFile(join(root, journeysFile(stack)), "utf8").catch(
              (error: unknown) => {
                // No file is what the check reports.
                if (isMissing(error)) return undefined;
                throw error;
              },
            ),
          ] as const,
      ),
    ),
  );
}
