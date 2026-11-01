/**
 * The access code an intro link carries, from a hub address such as
 * `https://hub.example.com/i/K7XQ2`. Core decides whether it works.
 */
export function introCode(page: string | URL): string | undefined {
  return /^\/i\/([^/]+)\/?$/.exec(new URL(page).pathname)?.[1];
}
