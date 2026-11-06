// A fault's message says what robkit was doing, with the detail that tells
// one failure from another, or it passes on the error underneath as cause.
// A fixed sentence with neither, such as "Core couldn't store the session.",
// leaves the log nothing to go on. See docs/conventions/errors.md.

/**
 * Whether `node` is a message with nothing in it but fixed text: a string,
 * or a template literal with no `${}`.
 * @param {any} node
 */
function isFixedText(node) {
  return (
    (node.type === "Literal" && typeof node.value === "string") ||
    (node.type === "TemplateLiteral" && node.expressions.length === 0)
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Give a thrown Error the detail that tells one failure from another, or its cause",
    },
    messages: {
      bare: "This error's message is fixed text with no cause. Name what was tried, such as the table, key, file or attempt count, or pass the error underneath as { cause }. See docs/conventions/errors.md.",
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      "ThrowStatement > NewExpression"(node) {
        const [message, options] = node.arguments;
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Error" &&
          (message === undefined || isFixedText(message)) &&
          options === undefined
        ) {
          context.report({ node, messageId: "bare" });
        }
      },
    };
  },
};
