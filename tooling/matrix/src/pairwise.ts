/** One dimension of a matrix: its name and the values it takes. */
export interface Dimension {
  readonly name: string;
  readonly values: readonly string[];
}

/** One combination: a value for each dimension, by the dimension's name. */
export type Row = Readonly<Record<string, string>>;

interface Pair {
  readonly a: number;
  readonly aValue: string;
  readonly b: number;
  readonly bValue: string;
}

/** Every pair of values from two different dimensions, by key. */
function everyPair(dimensions: readonly Dimension[]): Map<string, Pair> {
  const pairs = new Map<string, Pair>();
  dimensions.forEach((first, a) => {
    dimensions.slice(a + 1).forEach((second, offset) => {
      const b = a + 1 + offset;
      for (const aValue of first.values) {
        for (const bValue of second.values) {
          pairs.set(keyOf(a, aValue, b, bValue), { a, aValue, b, bValue });
        }
      }
    });
  });
  return pairs;
}

function keyOf(a: number, aValue: string, b: number, bValue: string): string {
  return JSON.stringify(
    a < b ? [a, aValue, b, bValue] : [b, bValue, a, aValue],
  );
}

/** The pairs `row` holds, by key. */
function pairsIn(dimensions: readonly Dimension[], row: Row): string[] {
  const keys: string[] = [];
  dimensions.forEach((first, a) => {
    dimensions.slice(a + 1).forEach((second, offset) => {
      const aValue = row[first.name];
      const bValue = row[second.name];
      if (aValue !== undefined && bValue !== undefined) {
        keys.push(keyOf(a, aValue, a + 1 + offset, bValue));
      }
    });
  });
  return keys;
}

/**
 * Every pair of values from two different dimensions that none of `rows`
 * holds, as `name=value and name=value`.
 */
export function uncoveredPairs(
  dimensions: readonly Dimension[],
  rows: readonly Row[],
): string[] {
  const pairs = everyPair(dimensions);
  for (const row of rows) {
    for (const key of pairsIn(dimensions, row)) pairs.delete(key);
  }
  return [...pairs.values()].map(
    ({ a, aValue, b, bValue }) =>
      `${dimensions[a]?.name ?? ""}=${aValue} and ${dimensions[b]?.name ?? ""}=${bValue}`,
  );
}

/**
 * A small set of rows that holds every pair of values from two different
 * dimensions at least once. It starts with `seeds`, each completed with
 * the values that cover the most pairs still missing, then adds rows the
 * same way until no pair is missing. The same input always gives the same
 * rows.
 */
export function pairwise(
  dimensions: readonly Dimension[],
  seeds: readonly Row[] = [],
): Row[] {
  const missing = everyPair(dimensions);
  const rows: Row[] = [];

  /** How many missing pairs hold `value` in dimension `index`. */
  const reach = (index: number, value: string): number => {
    let count = 0;
    for (const { a, aValue, b, bValue } of missing.values()) {
      if (
        (a === index && aValue === value) ||
        (b === index && bValue === value)
      )
        count++;
    }
    return count;
  };

  const complete = (seed: Row): Row => {
    const chosen = new Map<number, string>();
    dimensions.forEach((dimension, index) => {
      const value = seed[dimension.name];
      if (value !== undefined) chosen.set(index, value);
    });
    // A row with no seed starts from a missing pair, so every row covers
    // at least one.
    const [start] = missing.values();
    if (chosen.size === 0 && start) {
      chosen.set(start.a, start.aValue);
      chosen.set(start.b, start.bValue);
    }
    dimensions.forEach((dimension, index) => {
      if (chosen.has(index)) return;
      let best: { value: string; covers: number; reach: number } | undefined;
      for (const value of dimension.values) {
        let covers = 0;
        for (const [other, otherValue] of chosen) {
          if (missing.has(keyOf(index, value, other, otherValue))) covers++;
        }
        const candidate = { value, covers, reach: reach(index, value) };
        if (
          !best ||
          candidate.covers > best.covers ||
          (candidate.covers === best.covers && candidate.reach > best.reach)
        ) {
          best = candidate;
        }
      }
      if (best) chosen.set(index, best.value);
    });
    return Object.fromEntries(
      dimensions.map((dimension, index) => [
        dimension.name,
        chosen.get(index) ?? "",
      ]),
    );
  };

  const take = (row: Row) => {
    rows.push(row);
    for (const key of pairsIn(dimensions, row)) missing.delete(key);
  };

  for (const seed of seeds) take(complete(seed));
  while (missing.size > 0) take(complete({}));
  return rows;
}
