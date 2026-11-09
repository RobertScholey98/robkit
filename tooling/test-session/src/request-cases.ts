import { isRecord } from "@robkit/input";
import cases from "../request-cases.json" with { type: "json" };

// request-cases.json holds the cases every port of the request guard must
// pass, one list per kind, under its own key: "address" for where the
// guard sends the browser, "cookies" for which cookie it reads, and
// "coreAddress" for which addresses of core each port's reader accepts. A ticket that adds a kind adds a key, a row
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

/**
 * One row of request-cases.json's `cookies` list: a page load on `example`,
 * open to anyone, whose `Cookie` header carries core's word that nobody is
 * signed in under some name. A guard that reads it as the session cookie
 * lets the browser in as nobody. One that doesn't sends it to core, as it
 * would a browser holding nothing.
 */
export interface CookieCase {
  name: string;
  /** Core's origin, as the app's settings name it. */
  core: string;
  /**
   * The `Cookie` header's bytes. The file gives them in hex, since a JSON
   * string can't carry every byte to both ports. Each port's runner hands
   * them to its guard as its server would.
   */
  cookie: Uint8Array;
  /** When, in seconds since 1970, the runner's clock says it is. */
  now: number;
  /** Whether the guard reads the cookie as the session cookie. */
  reads: boolean;
}

/** `hex` as bytes, with any spaces between them ignored. */
function bytesOf(hex: string): Uint8Array | undefined {
  const digits = hex.replaceAll(" ", "");
  if (!/^(?:[\da-f]{2})+$/i.test(digits)) return undefined;
  return new Uint8Array(Buffer.from(digits, "hex"));
}

function readCookieCase(value: unknown, index: number): CookieCase {
  const at = `request-cases.json cookies[${String(index)}]`;
  if (!isRecord(value)) throw new Error(`${at} must be an object.`);
  const { name, core, cookie, now, reads } = value;
  const bytes = typeof cookie === "string" ? bytesOf(cookie) : undefined;
  if (
    typeof name !== "string" ||
    typeof core !== "string" ||
    bytes === undefined ||
    !Number.isSafeInteger(now) ||
    typeof reads !== "boolean"
  ) {
    throw new Error(
      `${at} needs a name and core as strings, cookie as bytes in hex, now as whole seconds, and reads as true or false.`,
    );
  }
  return { name, core, cookie: bytes, now: Number(now), reads };
}

/**
 * One row of request-cases.json's `coreAddress` list: an address of core,
 * always a bare origin, and whether each port accepts it, from settings or
 * written in code. An http origin passes only on a local domain.
 */
export interface CoreAddressCase {
  origin: string;
  accepted: boolean;
}

function readCoreAddressCase(value: unknown, index: number): CoreAddressCase {
  const at = `request-cases.json coreAddress[${String(index)}]`;
  if (
    !isRecord(value) ||
    typeof value.origin !== "string" ||
    typeof value.accepted !== "boolean"
  ) {
    throw new Error(
      `${at} needs an origin as a string and accepted as true or false.`,
    );
  }
  return { origin: value.origin, accepted: value.accepted };
}

/** The list of cases under `kind` in `file`, or a throw that names it. */
function listIn(file: unknown, kind: keyof RequestCases): unknown[] {
  const list = isRecord(file) ? file[kind] : undefined;
  if (!Array.isArray(list)) {
    throw new Error(
      `request-cases.json must be an object with a "${kind}" list of cases, but it holds ${JSON.stringify(file)}.`,
    );
  }
  return list;
}

/** The cases request-cases.json holds, by kind. */
export interface RequestCases {
  address: AddressCase[];
  cookies: CookieCase[];
  coreAddress: CoreAddressCase[];
}

/** The cases in `value`, as request-cases.json holds them. Throws on a bad one. */
export function readRequestCases(value: unknown): RequestCases {
  return {
    address: listIn(value, "address").map(readCase),
    cookies: listIn(value, "cookies").map(readCookieCase),
    coreAddress: listIn(value, "coreAddress").map(readCoreAddressCase),
  };
}

/** The cases every port of the guard must pass. */
const requestCases = readRequestCases(cases);

/** The address cases every port of the guard must pass. */
export const addressCases = requestCases.address;

/** The cookie cases every port of the guard must pass. */
export const cookieCases = requestCases.cookies;

/** The addresses of core every port's reader must judge alike. */
export const coreAddressCases = requestCases.coreAddress;
