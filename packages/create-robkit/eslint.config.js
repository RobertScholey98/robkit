import { config } from "@internal/eslint-config";

export default [
  // The templates are an install's files, which the install lints itself.
  { ignores: ["templates/"] },
  ...config(import.meta.dirname),
];
