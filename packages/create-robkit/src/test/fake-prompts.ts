import { CANCEL_SYMBOL, type select, type text } from "@clack/prompts";
import type { Prompts } from "../prompts.ts";

/** Pressing Ctrl+C at a prompt. */
export const cancel: typeof CANCEL_SYMBOL = CANCEL_SYMBOL;

/**
 * What the person does at a prompt: types this at a text prompt, or picks
 * the option with this value at a select. An empty string types nothing.
 */
export type Answer = string | typeof cancel;

export interface Asking {
  prompts: Prompts;
  /** Each question asked, in order, once for each time it was answered. */
  asked: string[];
  /** What validate said about each answer it refused, in order. */
  refused: string[];
}

/**
 * Prompts that answer from `answers`, in order, the way clack's would: a
 * text prompt validates what was typed, asks again while it's refused, and
 * takes its default for nothing typed. A select refuses an option it
 * doesn't offer or has disabled. Running out of answers fails the test.
 */
export function answering(answers: readonly Answer[]): Asking {
  const queue = [...answers];
  const asked: string[] = [];
  const refused: string[] = [];

  function next(message: string): Answer {
    asked.push(message);
    if (queue.length === 0) throw new Error(`No answer left for "${message}"`);
    return queue.shift() ?? "";
  }

  const fakeText: typeof text = async ({ message, defaultValue, validate }) => {
    if (validate !== undefined && typeof validate !== "function") {
      throw new Error("The fake prompts can't run a schema's validate");
    }
    for (;;) {
      const typed = next(message);
      if (typeof typed === "symbol") return cancel;
      // clack validates nothing typed as undefined, then takes the default.
      const problem = await validate?.(typed === "" ? undefined : typed);
      if (problem === undefined) return typed || (defaultValue ?? "");
      refused.push(problem instanceof Error ? problem.message : problem);
    }
  };

  const fakeSelect = (({ message, options }) => {
    const picked = next(message);
    if (typeof picked === "symbol") return Promise.resolve(cancel);
    const option = options.find(({ value }) => value === picked);
    if (option === undefined || option.disabled === true) {
      throw new Error(`"${message}" doesn't offer ${picked}`);
    }
    return Promise.resolve(option.value);
  }) as typeof select;

  return {
    prompts: { intro: () => undefined, text: fakeText, select: fakeSelect },
    asked,
    refused,
  };
}
