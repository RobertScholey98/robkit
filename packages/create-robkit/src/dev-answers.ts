import { CommandProblem, type DevAnswer } from "@robkit/dev/cli";
import type { Slug } from "@robkit/input";

/**
 * What `robkit add` prints once it has written `slug` and asked the
 * install's `pnpm dev` to start it. With no `pnpm dev` running, it says how
 * to start one, and to install first when the install has no dependencies.
 *
 * @throws {CommandProblem} when `pnpm dev` refused to start the app
 */
export function afterAdd(
  slug: Slug,
  answer: DevAnswer,
  { hasDependencies, origin }: { hasDependencies: boolean; origin: string },
): string {
  switch (answer.outcome) {
    case "refused":
      throw new CommandProblem(`Added apps/${slug}, but pnpm dev couldn't start it:

  ${answer.message}

Fix that, then stop pnpm dev and start it again, which starts every app in apps/.`);
    case "done":
      return `Added apps/${slug}. ${answer.message}`;
    case "not-running":
      return `Added apps/${slug}. Next:
${hasDependencies ? "" : "\n  pnpm install"}
  pnpm dev

Then open ${origin}.`;
  }
}

/**
 * What `robkit migrate` prints once it has asked the install's `pnpm dev`
 * to migrate an app.
 *
 * @throws {CommandProblem} when `pnpm dev` refused
 */
export function afterMigrate(answer: DevAnswer): string {
  switch (answer.outcome) {
    case "refused":
      throw new CommandProblem(answer.message);
    case "done":
      return answer.message;
    case "not-running":
      return "No pnpm dev is running in this install. Start it with pnpm dev, which migrates every app as it starts.";
  }
}
