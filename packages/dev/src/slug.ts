const reserved = new Set(["public", "postgres"]);

/**
 * An app's slug is its folder name under `apps/`, its subdomain and its
 * Postgres role and schema. Slugs are lowercase letters and digits, so each
 * is a valid hostname label, app code can write `notes.note` without quoting,
 * and they can be inlined into DDL safely.
 *
 * @returns why `name` can't be a slug, or `undefined` if it can
 */
export function slugProblem(name: string): string | undefined {
  if (/^[a-z][a-z0-9]{0,62}$/.test(name) && !reserved.has(name)) {
    return undefined;
  }
  return `"${name}" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`;
}
