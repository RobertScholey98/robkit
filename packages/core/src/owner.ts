/** The username, trimmed, and password someone sent to sign in as the owner. */
export interface Credentials {
  username: string;
  password: string;
}

/** The username and password a request sent, or why they won't do. */
export function readCredentials(
  fields: Record<string, unknown>,
): Credentials | { error: string } {
  const { username, password } = fields;
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "Send a username and a password." };
  }
  return { username: username.trim(), password };
}

/** The new owner's username and password, or why they won't do. */
export function readNewOwner(
  fields: Record<string, unknown>,
): Credentials | { error: string } {
  const credentials = readCredentials(fields);
  if ("error" in credentials) return credentials;
  const { username, password } = credentials;
  if (username.length < 1 || username.length > 64) {
    return { error: "Pick a username of 1 to 64 characters." };
  }
  if (password.length < 12) {
    return { error: "Pick a password of at least 12 characters." };
  }
  return credentials;
}
