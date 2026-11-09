import { isRecord } from "@robkit/input";
import cases from "../request-cases.json" with { type: "json" };

// request-cases.json holds the cases every port of the request guard must
// pass, one list per kind, under its own key: "address" for where the
// guard sends the browser. A ticket that adds a kind adds a key, a row
// type and a reader here, and a reader in go/internal/conformance.

/**
 * One row of request-cases.json's `address` list: a page load on the app the tests guard,
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
  const at = `request-cases.json address[${String(index)}]`;
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

/** The cases request-cases.json holds, by kind. */
export interface RequestCases {
  address: AddressCase[];
}

/** The cases in `value`, as request-cases.json holds them. Throws on a bad one. */
export function readRequestCases(value: unknown): RequestCases {
  if (!isRecord(value) || !Array.isArray(value.address)) {
    throw new Error(
      `request-cases.json must be an object with an "address" list of cases, but it holds ${JSON.stringify(value)}.`,
    );
  }
  return { address: value.address.map(readCase) };
}

/** The address cases every port of the guard must pass. */
export const addressCases = readRequestCases(cases).address;
