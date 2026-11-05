const maxLength = 72;

/** Imperative verbs that happen to end in "ed" or "ing". */
const imperativeExceptions = new Set([
  "Bring",
  "Embed",
  "Exceed",
  "Feed",
  "Need",
  "Ping",
  "Proceed",
  "Seed",
  "Shed",
  "Speed",
  "String",
  "Succeed",
]);

/** A commit message's subject: its first line that isn't blank or a git comment. */
export function subjectOf(message: string): string | undefined {
  return message
    .split("\n")
    .find((line) => !line.startsWith("#") && line.trim() !== "")
    ?.trimEnd();
}

/**
 * Lists what's wrong with a commit message's subject. The commit-msg hook and
 * CI both check with it, through check-commit-subjects.ts.
 */
export function subjectProblems(message: string): string[] {
  const subject = subjectOf(message);
  if (subject === undefined) return ["The message has no subject."];

  const problems: string[] = [];
  if (subject.length > maxLength) {
    problems.push(
      `The subject is ${String(subject.length)} characters; keep it to ${String(maxLength)}.`,
    );
  }
  if (subject.endsWith(".")) problems.push("The subject ends with a period.");
  if (!/^[A-Z]/.test(subject)) {
    problems.push("The subject starts with a capital letter.");
  }
  const firstWord = subject.split(/\s/, 1)[0] ?? "";
  if (/(ed|ing)$/i.test(firstWord) && !imperativeExceptions.has(firstWord)) {
    problems.push(
      `The subject starts with an imperative verb ("Add", not "Added" or "Adding").`,
    );
  }
  return problems;
}
