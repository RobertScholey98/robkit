import { choiceTable, readyOptions } from "./choices.ts";

const flagWidth = 24;
const lineWidth = 78;

/** One flag's lines, its description wrapped in a column of its own. */
function flagLine(flag: string, description: string): string {
  const indent = " ".repeat(flagWidth + 2);
  const lines = [`  ${flag}`.padEnd(indent.length)];
  for (const word of description.split(" ")) {
    const line = lines.at(-1) ?? "";
    if (line.length === indent.length) {
      lines[lines.length - 1] = line + word;
    } else if (line.length + 1 + word.length > lineWidth) {
      lines.push(indent + word);
    } else {
      lines[lines.length - 1] = `${line} ${word}`;
    }
  }
  return lines.join("\n");
}

/** init's usage text, with each choice's ready options from the table. */
export const usage = [
  `Usage: npm create robkit [folder] -- [options]

With no options, init asks for each one.
`,
  ...Object.values(choiceTable).map((choice) => {
    const options = readyOptions(choice).map((option) => option.value);
    const list = choice.takes === "list";
    return flagLine(
      `--${choice.flag} <${list ? "list" : "name"}>`,
      `${choice.about}: ${options.join(", ")}${"orNone" in choice ? ", or none" : ""}`,
    );
  }),
  flagLine("--install", "install dependencies and initialise git"),
  flagLine(
    "--link",
    "link the @robkit packages to the robkit checkout this runs from, instead of installing them from npm",
  ),
].join("\n");
