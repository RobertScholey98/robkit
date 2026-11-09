import { config } from "@internal/eslint-config";

// A test package, which robkit doesn't ship. Like a test file, it may cast to
// build what it feeds robkit, so the rule against casts is off.
export default [
  ...config(import.meta.dirname),
  { rules: { "@typescript-eslint/no-unsafe-type-assertion": "off" } },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/browser.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='networkidle']",
          message:
            "Playwright's networkidle can be taken back by load and never fire again. Use networkIdle from browser.ts.",
        },
      ],
    },
  },
];
