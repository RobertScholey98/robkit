/** The longest name and message a signature may have. */
export const limits = { name: 60, message: 500 } as const;

/** Why a signature can't go in the guestbook, or `undefined` if it can. */
export function entryProblem(
  name: string,
  message: string,
): string | undefined {
  if (name.trim() === "") return "Write your name.";
  if (message.trim() === "") return "Write a message.";
  if (name.length > limits.name) {
    return `Keep your name under ${String(limits.name)} characters.`;
  }
  if (message.length > limits.message) {
    return `Keep your message under ${String(limits.message)} characters.`;
  }
  return undefined;
}
