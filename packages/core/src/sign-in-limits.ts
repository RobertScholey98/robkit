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
}

export const defaultSignInLimits: SignInLimits = {
  passwordsPerClient: 5,
  codesPerClient: 10,
  clientWindowMs: 15 * minute,
};
