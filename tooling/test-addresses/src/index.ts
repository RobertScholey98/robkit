// Session's checked addresses, built for tests the way the code builds them:
// with session's readers. robkit/no-brand-cast refuses a cast to one.
//
// Not in @internal/test-session, which session's own tests use: it can't
// depend on session without a cycle. Session's tests read their own.

import { readSlug, type Slug } from "@robkit/session/addresses";
import { isProblem } from "@robkit/session/input";

/** `name` as a slug. Throws session's problem if it isn't one. */
export function slug(name: string): Slug {
  const read = readSlug(name);
  if (isProblem(read)) throw new Error(read.error);
  return read;
}
