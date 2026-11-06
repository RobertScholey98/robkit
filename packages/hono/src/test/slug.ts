import { readSlug, type Slug } from "@robkit/session/addresses";
import { isProblem } from "@robkit/session/input";

/** `name` as a slug, for a test that names its apps. */
export function slug(name: string): Slug {
  const read = readSlug(name);
  if (isProblem(read)) throw new Error(read.error);
  return read;
}
