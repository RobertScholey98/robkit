// JSON from outside robkit's own code, parsed to `unknown` for a reader to
// check. See docs/conventions/input.md.

import { problem, type InputProblem } from "./problem.ts";

/** `text` parsed as JSON, or a problem naming `source`. */
export function parseJson(
  text: string,
  source: string,
): { json: unknown } | InputProblem {
  try {
    return { json: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return problem(`${source} isn't valid JSON (${reason}). Fix its syntax.`);
  }
}
