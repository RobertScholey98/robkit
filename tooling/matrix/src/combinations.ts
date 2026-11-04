import {
  choiceTable,
  listFlag,
  readyOptions,
  type Choice,
} from "create-robkit";
import { pairwise, type Dimension, type Row } from "./pairwise.ts";

/** One install the kit matrix makes, as init's flags spell it. */
export interface Combination {
  /** The flags, as one line: what a CI job is named after. */
  readonly name: string;
  /** init's flags that make it, by flag name. */
  readonly flags: Readonly<Record<string, string>>;
}

/** The choices to combine: init's table, or a test's. */
export type Table = Readonly<Record<string, Choice>>;

/** The values of a dimension that is one option, switched on or off. */
const on = "on";
const off = "off";

/** A list with `orNone`, such as the dev tools: each option is on or off. */
function isToggles(choice: Choice): boolean {
  return choice.takes === "list" && choice.orNone === true;
}

function toggleName(choice: Choice, value: string): string {
  return `${choice.flag}:${value}`;
}

/**
 * The matrix's dimensions for one choice. A choice that takes one option
 * is one dimension. A list of stacks takes every ready one, so its
 * dimension is which comes first, the stack the example app is on. A list
 * that may be empty, such as the dev tools, is one on-or-off dimension per
 * option.
 */
function dimensionsOf(choice: Choice): Dimension[] {
  const values = readyOptions(choice).map((option) => option.value);
  if (isToggles(choice)) {
    return values.map((value) => ({
      name: toggleName(choice, value),
      values: [on, off],
    }));
  }
  return [{ name: choice.flag, values }];
}

/** The flags that make the install a row describes. */
function flagsOf(table: Table, row: Row): Record<string, string> {
  return Object.fromEntries(
    Object.values(table).map((choice) => {
      const values = readyOptions(choice).map((option) => option.value);
      if (isToggles(choice)) {
        return [
          choice.flag,
          listFlag(
            values.filter((value) => row[toggleName(choice, value)] === on),
          ),
        ];
      }
      const value = row[choice.flag] ?? "";
      if (choice.takes === "list") {
        return [
          choice.flag,
          listFlag([value, ...values.filter((other) => other !== value)]),
        ];
      }
      return [choice.flag, value];
    }),
  );
}

function combinationOf(table: Table, row: Row): Combination {
  const flags = flagsOf(table, row);
  return {
    name: Object.entries(flags)
      .map(([flag, value]) => `--${flag} ${value}`)
      .join(" "),
    flags,
  };
}

function isToggle(dimension: Dimension): boolean {
  return dimension.values.every((value) => value === on || value === off);
}

/**
 * Two rows to start from: every toggle on, and every toggle off. An
 * install's own CI runs a tool's steps only when it has the tool, so each
 * set has one install with every tool and one with none.
 */
function toggleSeeds(dimensions: readonly Dimension[]): Row[] {
  const toggles = dimensions.filter(isToggle);
  return [on, off].map((value) =>
    Object.fromEntries(toggles.map((dimension) => [dimension.name, value])),
  );
}

/**
 * The installs each pull request makes: a small set that holds every pair
 * of options from two different choices at least once, starting from one
 * install with every tool and one with none.
 */
export function pullRequestSet(table: Table = choiceTable): Combination[] {
  const dimensions = Object.values(table).flatMap(dimensionsOf);
  return pairwise(dimensions, toggleSeeds(dimensions)).map((row) =>
    combinationOf(table, row),
  );
}

/**
 * The installs the nightly job makes: every combination of the choices
 * that take one option and of the first stack. Each one's tools are those
 * that meet the most options they haven't met yet, so the set still holds
 * every pair, and it starts with one install with every tool and one with
 * none.
 */
export function nightlySet(table: Table = choiceTable): Combination[] {
  const dimensions = Object.values(table).flatMap(dimensionsOf);
  const answers = dimensions.filter((dimension) => !isToggle(dimension));
  const product = answers.reduce<Row[]>(
    (rows, dimension) =>
      rows.flatMap((row) =>
        dimension.values.map((value) => ({ ...row, [dimension.name]: value })),
      ),
    [{}],
  );
  const toggles = toggleSeeds(dimensions);
  const seeds = product.map((row, index) => ({ ...row, ...toggles[index] }));
  return pairwise(dimensions, seeds).map((row) => combinationOf(table, row));
}

/** Every dimension the sets combine, for checking their coverage. */
export function dimensionsOfTable(table: Table = choiceTable): Dimension[] {
  return Object.values(table).flatMap(dimensionsOf);
}

/** The row a combination's flags describe, to check coverage against. */
export function rowOf(table: Table, combination: Combination): Row {
  return Object.fromEntries(
    Object.values(table).flatMap((choice) => {
      const value = combination.flags[choice.flag] ?? "";
      if (isToggles(choice)) {
        const chosen = value === "none" ? [] : value.split(",");
        return readyOptions(choice).map((option) => [
          toggleName(choice, option.value),
          chosen.includes(option.value) ? on : off,
        ]);
      }
      return [[choice.flag, value.split(",")[0] ?? ""]];
    }),
  );
}
