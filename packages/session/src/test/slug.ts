import { readSlug, type Slug } from "../install-addresses.ts";
import { isProblem } from "../problem.ts";

/**
 * `name` as a slug, for a test that names its apps. Every package above
 * session takes `slug` from @internal/test-addresses, which depends on
 * session, so session's own tests read theirs here.
 */
export function slug(name: string): Slug {
  const read = readSlug(name);
  if (isProblem(read)) throw new Error(read.error);
  return read;
}
