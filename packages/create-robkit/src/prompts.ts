import { intro, select, text } from "@clack/prompts";

/** The prompts a wizard asks its questions with. Tests pass fakes. */
export interface Prompts {
  intro: typeof intro;
  text: typeof text;
  select: typeof select;
}

/** clack's prompts, which ask in the terminal. */
export const terminalPrompts: Prompts = { intro, text, select };
