import { relative } from "node:path";

// What the pre-commit hook runs on the files a commit stages. ESLint fixes
// the staged code in packages/ and tooling/, each file with its own
// package's config, and Prettier formats every staged file it knows.
// create-robkit's templates are an install's own files, which the install
// lints, so robkit's ESLint skips them.
const code = /^(packages|tooling)\/.*\.[cm]?[jt]sx?$/;
const templates = /^packages\/create-robkit\/templates\//;

/** @param {string[]} files */
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(" ");

export default {
  /** @param {string[]} files absolute paths */
  "*": (files) => {
    const linted = files.filter((file) => {
      const path = relative(import.meta.dirname, file).replaceAll("\\", "/");
      return code.test(path) && !templates.test(path);
    });
    return [
      ...(linted.length > 0
        ? [`eslint --fix --no-warn-ignored ${quoted(linted)}`]
        : []),
      `prettier --write --ignore-unknown ${quoted(files)}`,
    ];
  },
};
