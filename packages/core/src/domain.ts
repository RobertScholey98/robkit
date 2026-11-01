/**
 * Whether the install runs on `localhost` or a name under it, which only
 * ever means development.
 */
export function isLocal(domain: string): boolean {
  return domain === "localhost" || domain.endsWith(".localhost");
}
