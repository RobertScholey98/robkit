// Which files are tests or test helpers. Tests may cast and throw what they
// like to build what they feed the code under test, so some rules skip them.

/** Tests, type tests and the helpers in `test/` folders, as config globs. */
export const testFiles = [
  "**/*.test.ts",
  "**/*.test-d.ts",
  "**/*.test.tsx",
  "**/test/**",
];

/**
 * Whether `filename` is one of `testFiles`, for a rule that skips only part
 * of its checks in tests. A pattern rather than the globs, since a glob's
 * `**` skips folders that start with a dot, such as `~/.t3/`.
 */
export function isTestFile(/** @type {string} */ filename) {
  const path = filename.replaceAll("\\", "/");
  return /\.test(-d)?\.tsx?$/.test(path) || /(^|\/)test\//.test(path);
}
