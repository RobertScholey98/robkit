import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// A failed read has one type, InputProblem, checked one way, isProblem.
const oneProblemType = [
  {
    selector:
      "TSTypeLiteral[members.length=1] > TSPropertySignature[key.name='error'][optional!=true] > TSTypeAnnotation > TSStringKeyword",
    message:
      "A failed read is an InputProblem from @robkit/session/input, not a { error: string } of its own.",
  },
  {
    selector: "BinaryExpression[operator='in'][left.value='error']",
    message:
      'Check a read with isProblem from @robkit/session/input, not "error" in.',
  },
];

// Parsed JSON is any, which no-unsafe-type-assertion lets a cast through.
const parsedJson =
  ":matches(CallExpression[callee.object.name='JSON'][callee.property.name='parse'], CallExpression[callee.property.name='json'])";
const jsonCast = {
  selector: `:matches(TSAsExpression, TSTypeAssertion) > :matches(${parsedJson}, AwaitExpression > ${parsedJson})`,
  message:
    "Parsed JSON is unknown until a reader checks it. Read it with one rather than casting it.",
};

export default defineConfig(
  // TanStack Router writes routeTree.gen.ts from the files in src/routes.
  { ignores: ["**/dist/", "**/routeTree.gen.ts"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...oneProblemType] },
  },
  {
    // Input from outside goes through a reader; a cast would skip it. Tests
    // may cast to build what they feed the code under test.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
    rules: {
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "no-restricted-syntax": ["error", ...oneProblemType, jsonCast],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
