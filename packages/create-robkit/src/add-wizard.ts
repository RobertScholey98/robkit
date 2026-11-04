import {
  confirm,
  intro,
  isCancel,
  select,
  text,
  type CANCEL_SYMBOL,
} from "@clack/prompts";
import { newSlugProblem, type AppChoices } from "./add.ts";
import { choiceTable, type Choices, type Generator } from "./choices.ts";
import { defaultIcon } from "./generate.ts";

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
  "ui-kit"?: boolean | undefined;
}

export const addUsage = `Usage: robkit add [name] [--stack <stack>] [--access ${accessOptions.map((option) => option.value).join("|")}] [--roles <role,...>] [--icon <emoji>] [--ui-kit | --no-ui-kit]

With no flags, robkit add asks for each. With flags, it asks nothing: the
stack defaults to the first robkit.json offers, access to owner only, and
the icon to ${defaultIcon}. In an install with a UI kit, the app uses it
unless --no-ui-kit.`;

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
      throw new Error("--access roles needs --roles, naming at least one.");
    }
    return { kind: "roles", roles: named };
  }
  if (roles !== undefined) {
    throw new Error("--roles only goes with --access roles.");
  }
  if (access === "open" || access === "owner") return { kind: access };
  throw new Error(
    `--access ${access} isn't an option. Choose from: ${accessOptions.map((option) => option.value).join(", ")}.`,
  );
}

/** The app robkit add's flags describe, with a default for each left out. */
export function appChoicesFromFlags(
  slug: string,
  flags: AddFlags,
  { generators, uiKit }: Pick<Choices, "generators" | "uiKit">,
): AppChoices {
  const usesKit = flags["ui-kit"] ?? (uiKit === null ? undefined : true);
  return {
    stack: (flags.stack ?? generators[0]) as Generator,
    slug,
    access: accessFrom(flags.access ?? "owner", flags.roles),
    icon: flags.icon ?? defaultIcon,
    ...(usesKit !== undefined && { uiKit: usesKit }),
  };
}

/**
 * The robkit command that adds the same app without asking, as the
 * install's `robkit` script takes it.
 */
export function addCommandFor({
  stack,
  slug,
  access,
  icon,
  uiKit,
}: AppChoices) {
  return [
    `robkit add ${slug}`,
    `--stack ${stack}`,
    `--access ${access.kind}`,
    ...(access.kind === "roles" ? [`--roles "${access.roles.join(",")}"`] : []),
    `--icon ${icon}`,
    ...(uiKit === undefined ? [] : [uiKit ? "--ui-kit" : "--no-ui-kit"]),
  ].join(" ");
}

function answered<T>(answer: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(answer)) throw new Error("Cancelled. Nothing was written.");
  return answer;
}

/**
 * Asks robkit add's questions for the install at `root`, skipping the name
 * when it's already given, the stack when robkit.json offers only one, and
 * the UI kit when the install has none.
 */
export async function askAdd(
  root: string,
  { generators, uiKit }: Pick<Choices, "generators" | "uiKit">,
  given?: string,
): Promise<AppChoices> {
  if (given !== undefined) {
    const problem = newSlugProblem(root, given);
    if (problem) throw new Error(problem);
  }
  intro("robkit add");
  const labels = new Map<string, string>(
    choiceTable.generators.options.map((option) => [
      option.value,
      option.label,
    ]),
  );
  const [first] = generators;
  const stack =
    generators.length === 1
      ? first
      : answered(
          await select<Generator>({
            message: "Which stack?",
            options: generators.map((value) => ({
              value,
              label: labels.get(value) ?? value,
            })),
          }),
        );
  const slug =
    given ??
    answered(
      await text({
        message: "What's the app called?",
        placeholder: "notes",
        validate: (answer) => newSlugProblem(root, answer ?? ""),
      }),
    );
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
    }),
  );
  const usesKit =
    uiKit === null
      ? undefined
      : answered(await confirm({ message: "Use the install's UI kit?" }));
  return {
    stack,
    slug,
    access: accessFrom(access, roles),
    icon,
    ...(usesKit !== undefined && { uiKit: usesKit }),
  };
}
