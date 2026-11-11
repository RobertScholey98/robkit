// What a code block's frame says above the code: the file's name, or what
// kind of code it is.

/** The `title="..."` a fence's meta gives, as in ```ts title="go.mod". */
export function fenceTitle(meta: string | undefined): string | undefined {
  const match = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/.exec(meta ?? "");
  return match?.[1] ?? match?.[2];
}

const shells = new Set(["sh", "bash", "shell"]);

/** Whether a block in `lang` holds commands to type, not a file's text. */
export const isCommand = (lang: string): boolean => shells.has(lang);

const languages = new Map([
  ["ts", "TypeScript"],
  ["tsx", "TSX"],
  ["js", "JavaScript"],
  ["go", "Go"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["sql", "SQL"],
  ["html", "HTML"],
  ["css", "CSS"],
]);

/**
 * The label above a block: its file's name if it has one, "Terminal" for
 * commands, or else its language.
 */
export function codeLabel(lang: string, title?: string): string {
  if (title !== undefined) return title;
  if (isCommand(lang)) return "Terminal";
  return languages.get(lang) ?? lang;
}
