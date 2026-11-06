// A failed read has one type, InputProblem, checked one way, isProblem. A
// hand-written `{ error: string }` or an `"error" in` check is a second
// way. See docs/conventions/input.md.

/**
 * Whether `node` is a type literal with one member, a required `error`
 * string.
 * @param {any} node a TSTypeLiteral
 */
function isErrorShape(node) {
  const [member, ...rest] = node.members;
  if (rest.length > 0 || member?.type !== "TSPropertySignature") return false;
  const { key } = member;
  const name = key.type === "Identifier" ? key.name : key.value;
  return (
    name === "error" &&
    !member.optional &&
    !member.computed &&
    member.typeAnnotation?.typeAnnotation.type === "TSStringKeyword"
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Type a failed read as InputProblem and check it with isProblem",
    },
    messages: {
      type: "A failed read is an InputProblem from @robkit/session/input, not a { error: string } of its own. See docs/conventions/input.md.",
      check:
        'Check a read with isProblem from @robkit/session/input, not "error" in. See docs/conventions/input.md.',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      TSTypeLiteral(node) {
        if (isErrorShape(node)) context.report({ node, messageId: "type" });
      },
      BinaryExpression(node) {
        if (
          node.operator === "in" &&
          node.left.type === "Literal" &&
          node.left.value === "error"
        ) {
          context.report({ node, messageId: "check" });
        }
      },
    };
  },
};
