import { readSlug, type Slug } from "../install-addresses.ts";

/** `name` as a slug, for a test that names its apps. */
export function slug(name: string): Slug {
  const read = readSlug(name);
  if (typeof read !== "string") throw new Error(read.error);
  return read;
}
