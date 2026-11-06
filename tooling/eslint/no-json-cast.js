// Parsed JSON is `any`, so `no-unsafe-type-assertion` lets a cast of it
// through. This rule refuses one. See docs/conventions/input.md.

/**
 * `node` without the `await`, `!` and parentheses around it.
 * @param {any} node
 * @returns {any}
 */
function unwrap(node) {
  if (node.type === "AwaitExpression") return unwrap(node.argument);
  if (node.type === "TSNonNullExpression") return unwrap(node.expression);
  return node;
}

/**
 * Whether `node` is `JSON.parse(...)` or a `.json()` call.
 * @param {any} node
 */
function isJsonParse(node) {
  if (node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  const method = callee.property.name;
  if (method === "json") return true;
  return (
    method === "parse" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "JSON"
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Refuse a cast of parsed JSON" },
    messages: {
      cast: "Parsed JSON is unknown until a reader checks it. Read it with one rather than casting it. See docs/conventions/input.md.",
    },
    schema: [],
  },
  create(context) {
    /** @param {any} node */
    function check(node) {
      if (isJsonParse(unwrap(node.expression))) {
        context.report({ node, messageId: "cast" });
      }
    }
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};
