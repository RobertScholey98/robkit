// What the pre-commit hook runs on the files a commit stages. robkit check
// reads the whole install, so it runs once and takes no file names. ESLint,
// Prettier and, for a Go app, gofmt fix the staged files themselves. gofmt
// has no ignore file, so its rule leaves out vendor/, robkit's own files,
// which a machine with no Go can then commit.
export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": [
    () => "robkit check",
    "eslint --fix --no-warn-ignored",
    "prettier --write",
  ],
  "*.{json,md,css,html,yml,yaml}": "prettier --write",
  "!(vendor)/**/*.go": "gofmt -w",
};
