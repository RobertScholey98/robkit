// An app's slug, and the platform apps whose names are slugs as they stand.
// The manifest, the app's environment and an install's addresses all take
// one, so it sits here, below them all.

import { isProblem, problem, type InputProblem } from "./problem.ts";

/** Core, the hub and admin. Core's app catalog doesn't list them. */
export const platformApps = ["core", "hub", "admin"] as const;

/** A platform app's slug. */
export type PlatformApp = (typeof platformApps)[number];

declare const slugBrand: unique symbol;

/**
 * An app's slug: its folder under `apps/`, its subdomain, and its Postgres
 * role and schema. Lowercase letters and digits, starting with a letter, so
 * each is a valid hostname label, app code can write `notes.note` without
 * quoting, and it can be inlined into DDL safely. Only `readSlug` makes one;
 * the platform apps' names are slugs as they stand.
 */
export type Slug = PlatformApp | (string & { readonly [slugBrand]: true });

/** Whether `slug` is a platform app rather than one of the owner's apps. */
export function isPlatformApp(slug: string): slug is PlatformApp {
  return platformApps.some((app) => app === slug);
}

const reserved = new Set(["public", "postgres"]);

function isSlug(value: unknown): value is Slug {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9]{0,62}$/.test(value) &&
    !reserved.has(value)
  );
}

/** `value` as a slug, or why it can't be one. */
export function readSlug(value: unknown): Slug | InputProblem {
  if (isSlug(value)) return value;
  const shown = value === undefined ? "Nothing" : JSON.stringify(value);
  return problem(
    `${shown} can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
  );
}

/**
 * Why `name` can't be a slug, or `undefined` if it can. Its shape fits a
 * prompt's `validate`.
 */
export function slugProblem(name: string): string | undefined {
  const slug = readSlug(name);
  return isProblem(slug) ? slug.error : undefined;
}
