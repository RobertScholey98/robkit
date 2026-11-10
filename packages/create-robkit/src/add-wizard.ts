import { isCancel, type CANCEL_SYMBOL } from "@clack/prompts";
import { CommandProblem } from "@robkit/dev/cli";
import { isProblem, readSlug } from "@robkit/input";
import { readAppManifest } from "@robkit/input/manifest";
import { newSlugProblem, readNewSlug, type AppChoices } from "./add.ts";
import {
  defaultChoices,
  readyStackOptions,
  stackFrom,
  type Stack,
} from "./choices.ts";
import { defaultIcon } from "./generate.ts";
import { terminalPrompts, type Prompts } from "./prompts.ts";

/** Who may open a new app, as `--access` spells it and the wizard asks it. */
const accessOptions = [
  { value: "owner", label: "Only me" },
  { value: "open", label: "Anyone, signed in or not" },
  { value: "roles", label: "Guests with certain roles" },
] as const;

type Access = (typeof accessOptions)[number]["value"];

/** robkit add's flags, as `node:util`'s `parseArgs` reads them. */
export interface AddFlags {
  stack?: string | undefined;
  access?: string | undefined;
  roles?: string | undefined;
  icon?: string | undefined;
}

export const addUsage = `Usage: robkit add [name] [--stack <stack>] [--access ${accessOptions.map((option) => option.value).join("|")}] [--roles <role,...>] [--icon <emoji>]

With no flags, robkit add asks for each. With flags, it asks nothing: the
stack defaults to ${defaultChoices.exampleStack}, access to owner only, and the icon
to ${defaultIcon}.`;

function accessFrom(
  access: string,
  roles: string | undefined,
): AppChoices["access"] {
  const named = (roles ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role !== "");
  if (access === "roles") {
    if (named.length === 0) {
      throw new CommandProblem(
        "--access roles needs --roles, naming at least one.",
      );
    }
    return { kind: "roles", roleNames: named };
  }
  if (roles !== undefined) {
    throw new CommandProblem("--roles only goes with --access roles.");
  }
  if (access === "open" || access === "owner") return { kind: access };
  throw new CommandProblem(
    `--access ${access} isn't an option. Choose from: ${accessOptions.map((option) => option.value).join(", ")}.`,
  );
}

/**
 * Why `icon` can't be an app's icon, by the manifest's own rule, so a bad
 * one fails now and not at the next `pnpm dev`. Its shape fits a prompt's
 * `validate`.
 */
function iconProblem(icon: string): string | undefined {
  const manifest = readAppManifest({ icon });
  return isProblem(manifest) ? manifest.error : undefined;
}

function readIcon(icon: string): string {
  const problem = iconProblem(icon);
  if (problem) throw new CommandProblem(problem);
  return icon;
}

/** The app robkit add's flags describe, with a default for each left out. */
export function appChoicesFromFlags(name: string, flags: AddFlags): AppChoices {
  const slug = readSlug(name);
  if (isProblem(slug)) throw new CommandProblem(slug.error);
  return {
    stack: stackFrom(flags.stack ?? defaultChoices.exampleStack),
    slug,
    access: accessFrom(flags.access ?? "owner", flags.roles),
    icon: readIcon(flags.icon ?? defaultIcon),
  };
}

/**
 * The robkit command that adds the same app without asking, as the
 * install's `robkit` script takes it.
 */
export function addCommandFor({ stack, slug, access, icon }: AppChoices) {
  return [
    `robkit add ${slug}`,
    `--stack ${stack}`,
    `--access ${access.kind}`,
    ...(access.kind === "roles"
      ? [`--roles "${access.roleNames.join(",")}"`]
      : []),
    `--icon ${icon}`,
  ].join(" ");
}

function answered<T>(answer: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(answer))
    throw new CommandProblem("Cancelled. Nothing was written.");
  return answer;
}

/**
 * Asks robkit add's questions for the install at `root` with `prompts`,
 * skipping the name when it's already given.
 */
export async function askAdd(
  root: string,
  given?: string,
  { intro, text, select }: Prompts = terminalPrompts,
): Promise<AppChoices> {
  if (given !== undefined) {
    const problem = newSlugProblem(root, given);
    if (problem) throw new CommandProblem(problem);
  }
  intro("robkit add");
  const stack = answered(
    await select<Stack>({
      message: "Which stack?",
      options: readyStackOptions,
    }),
  );
  const slug = readNewSlug(
    root,
    given ??
      answered(
        await text({
          message: "What's the app called?",
          placeholder: "notes",
          validate: (answer) => newSlugProblem(root, answer ?? ""),
        }),
      ),
  );
  if (isProblem(slug)) throw new CommandProblem(slug.error);
  const access = answered(
    await select<Access>({
      message: "Who can open it?",
      options: [...accessOptions],
    }),
  );
  const roles =
    access === "roles"
      ? answered(
          await text({
            message: "Which roles? Separate them with commas.",
            placeholder: "Family, Friends",
            validate: (answer) =>
              (answer ?? "").trim() === ""
                ? "Name at least one role."
                : undefined,
          }),
        )
      : undefined;
  const icon = answered(
    await text({
      message: "Which emoji should the launcher show?",
      placeholder: defaultIcon,
      defaultValue: defaultIcon,
      // Nothing typed takes the default, which clack doesn't validate.
      validate: (answer) => iconProblem(answer ?? defaultIcon),
    }),
  );
  return {
    stack,
    slug,
    access: accessFrom(access, roles),
    icon,
  };
}
