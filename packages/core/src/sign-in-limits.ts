const minute = 60 * 1000;

/**
 * The limits on signing in. An attempt counts from when core takes it to
 * check until its window passes after a wrong verdict, so a client's
 * limit covers its failures and its attempts still being checked.
 */
export interface SignInLimits {
  /** Password attempts each client may make in `clientWindowMs`. */
  passwordsPerClient: number;
  /** Access code attempts each client may make in `clientWindowMs`. */
  codesPerClient: number;
  /** How long a client's wrong attempt counts against it. */
  clientWindowMs: number;
  /**
   * Access code attempts the whole install may make in `installWindowMs`,
   * across every client. Once spent, every code sign-in gets 429.
   */
  codesPerInstall: number;
  /** How long a wrong access code counts against the install. */
  installWindowMs: number;
  /**
   * The most clients each route's limit keeps. A client is kept while it
   * holds a place or a failure in the window, and never dropped before.
   */
  clientsTracked: number;
  /**
   * The most password hashes and checks that run at once, `/setup`'s
   * included. Keep it under 4, Node's pool of scrypt threads.
   */
  passwordChecksAtOnce: number;
  /**
   * How many more wait their turn. One that finds them all waiting gets
   * 429.
   */
  passwordChecksWaiting: number;
}

export const defaultSignInLimits: SignInLimits = {
  passwordsPerClient: 5,
  codesPerClient: 10,
  clientWindowMs: 15 * minute,
  // A generated code is 5 characters from 31: N = 31^5, about 28.6 million.
  // An attacker wants any live code, not one in particular. At 20 guesses
  // an hour, 480 a day, trying all N takes N / 480 / 365, about 163 years,
  // however many codes are live. With k codes live, the first hit is
  // expected after about N / (k + 1) guesses: about 82 years with 1 live
  // code, and about 8 years with 20, about a 12% chance of a hit in a year.
  codesPerInstall: 20,
  installWindowMs: 60 * minute,
  // An estimate. Each client kept for /login failed a password at least
  // once in the window. At 2 checks at once and 30 ms a check, 15 minutes
  // holds about 2 × 900 s / 0.03 s = 60,000 wrong passwords, so 100,000
  // leaves room. A check measured 63 ms on Windows and 87 ms in WSL on the
  // machine these tests were written on (median of 20, 2026-11-10), so a
  // window there holds fewer. /login/code's limit fills only if something else is
  // wrong: the install's budget holds wrong codes to 20 an hour.
  clientsTracked: 100_000,
  passwordChecksAtOnce: 2,
  passwordChecksWaiting: 8,
};
