import { isProblem, isRecord, parseJson } from "@robkit/input";

/** `text` as a JSON object. Throws, naming `source`, if it isn't one. */
export function jsonObject(
  text: string,
  source: string,
): Record<string, unknown> {
  const parsed = parseJson(text, source);
  if (isProblem(parsed)) throw new Error(parsed.error);
  if (!isRecord(parsed.json)) {
    throw new Error(`${source} must be a JSON object.`);
  }
  return parsed.json;
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
