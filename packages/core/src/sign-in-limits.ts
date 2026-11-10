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
};
