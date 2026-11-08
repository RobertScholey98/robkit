import { parseArgs, type ParseArgsConfig } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";

/**
 * What's wrong with the arguments, from `parseArgs`'s message. Its message
 * for an option the command doesn't take goes on about positional
 * arguments, so that one gets a message of its own.
 */
function argsProblem(message: string): string {
  const unknown = /^Unknown option '([^']+)'/.exec(message)?.[1];
  return unknown === undefined ? message : `${unknown} isn't an option.`;
}

/**
 * The command line's arguments, as `node:util`'s `parseArgs` reads them
 * with `config`.
 *
 * @throws a {@link CommandProblem} saying what's wrong with them, such as
 *   an option the command doesn't take, followed by `usage`
 */
export function readArgs<T extends ParseArgsConfig>(
  config: T,
  usage: string,
): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    if (
      error instanceof TypeError &&
      "code" in error &&
      String(error.code).startsWith("ERR_PARSE_ARGS_")
    ) {
      throw new CommandProblem(`${argsProblem(error.message)}\n\n${usage}`, {
        cause: error,
      });
    }
    throw error;
  }
}
