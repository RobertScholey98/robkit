import { config } from "@internal/eslint-config";
import globals from "globals";

export default [
  ...config(import.meta.dirname),
  { files: ["src/**"], languageOptions: { globals: globals.browser } },
];
