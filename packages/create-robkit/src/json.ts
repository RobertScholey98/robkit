import { isRecord, orThrow, parseJson } from "@robkit/input";

/**
 * `text` as a JSON object. Throws, naming `source`, if it isn't one. It
 * reads files robkit ships, such as its templates, so a bad one is a fault
 * in robkit. Read a file the person owns with `parseJson`, and throw its
 * problem as a CommandProblem.
 */
export function jsonObject(
  text: string,
  source: string,
): Record<string, unknown> {
  const { json } = orThrow(parseJson(text, source));
  if (!isRecord(json)) throw new Error(`${source} must be a JSON object.`);
  return json;
}

/**
 * The string values of `value`, such as a manifest's dependencies. Anything
 * else is dropped, and a value that isn't an object reads as none.
 */
export function stringsIn(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
