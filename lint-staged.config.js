import { relative } from "node:path";

// What the pre-commit hook runs on the files a commit stages. ESLint fixes
// the staged code in packages/ and tooling/, each file with its own
// package's config, and Prettier formats every staged file it knows.
const code = /^(packages|tooling)\/.*\.[cm]?[jt]sx?$/;

/** @param {string[]} files */
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(" ");

export default {
  /** @param {string[]} files absolute paths */
  "*": (files) => {
    const linted = files.filter((file) =>
      code.test(relative(import.meta.dirname, file).replaceAll("\\", "/")),
    );
    return [
      ...(linted.length > 0
        ? [`eslint --fix --no-warn-ignored ${quoted(linted)}`]
        : []),
      `prettier --write --ignore-unknown ${quoted(files)}`,
    ];
  },
};
