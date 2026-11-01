import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const typescript = [".ts", ".tsx", ".mts"];
const javascript = [".js", ".jsx", ".mjs"];

/**
 * Whether `specifier`, imported from `filename`, should name a .ts file.
 * @param {string} filename
 * @param {string} specifier
 */
function lacksTypeScriptExtension(filename, specifier) {
  const extension = extname(specifier);
  if (typescript.includes(extension)) return false;
  if (extension === "") return true;

  const path = resolve(dirname(filename), specifier);
  // `./session.js` for session.ts is the old TypeScript habit. `./vite.config`
  // for vite.config.ts has an extname but is still missing the extension.
  const stem = javascript.includes(extension)
    ? path.slice(0, -extension.length)
    : path;
  return typescript.some((ts) => existsSync(stem + ts));
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require the .ts extension on relative imports",
    },
    messages: {
      extension:
        "Relative imports use the .ts extension, so Node can run source files directly.",
    },
    schema: [],
  },
  create(context) {
    if (!typescript.includes(extname(context.filename))) return {};

    /** @param {import("estree").Node | null | undefined} source */
    function check(source) {
      if (
        source?.type !== "Literal" ||
        typeof source.value !== "string" ||
        !/^\.\.?\//.test(source.value)
      ) {
        return;
      }
      if (lacksTypeScriptExtension(context.filename, source.value)) {
        context.report({ node: source, messageId: "extension" });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
