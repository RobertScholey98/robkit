import { isRecord } from "@robkit/input";
import cases from "../address-cases.json" with { type: "json" };

/**
 * One row of `address-cases.json`: a page load on the app the tests guard,
 * `example`, owner-only, with the headers a proxy or an attacker might
 * send. The guard in each port, and each adapter that builds the request's
 * URL itself, must send the browser to the same place for every row. Go's
 * tests read the same file.
 */
export interface AddressCase {
  name: string;
  /** Core's origin, as the app's settings name it. */
  core: string;
  /** The path and query on the request line. */
  target: string;
  /** The request's headers, by lowercase name. No `host` sends none. */
  headers: Record<string, string>;
  /**
   * Whether the browser holds core's word that nobody is signed in, so the
   * guard sends it to the hub to log in. Otherwise it holds nothing, and
   * the guard sends it to core for a token.
   */
  signedOut: boolean;
  /** The page the guard asks core or the hub to send the browser back to. */
  next: string;
}

function readCase(value: unknown, index: number): AddressCase {
  const at = `address-cases.json[${String(index)}]`;
  if (!isRecord(value)) throw new Error(`${at} must be an object.`);
  const { name, core, target, headers, signedOut = false, next } = value;
  const strings = [name, core, target, next];
  if (
    !strings.every((field) => typeof field === "string") ||
    typeof signedOut !== "boolean" ||
    !isRecord(headers) ||
    !Object.values(headers).every((header) => typeof header === "string")
  ) {
    throw new Error(
      `${at} needs a name, core, target and next as strings, headers as an object of strings, and signedOut as true, false or left out.`,
    );
  }
  return {
    name: String(name),
    core: String(core),
    target: String(target),
    headers: Object.fromEntries(
      Object.entries(headers).map(([key, header]) => [key, String(header)]),
    ),
    signedOut,
    next: String(next),
  };
}

/** The cases in `value`, as address-cases.json holds them. Throws on a bad one. */
export function readAddressCases(value: unknown): AddressCase[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `address-cases.json must be a list of cases, but it holds ${JSON.stringify(value)}.`,
    );
  }
  return value.map(readCase);
}

/** The cases every port of the guard must pass. */
export const addressCases = readAddressCases(cases);
