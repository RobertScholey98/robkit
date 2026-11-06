// A failed read has one type, InputProblem, checked one way, isProblem. A
// hand-written `{ error: string }` or an `"error" in` check is a second
// way. A problem thrown as a plain Error is a third: a command line prints
// it as a bug, and an app server with its stack. Tests and their helpers
// may throw one. See docs/conventions/input.md.

import { isTestFile } from "./test-files.js";

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
      type: "A failed read is an InputProblem from @robkit/input, not a { error: string } of its own. See robkit's docs/conventions/input.md.",
      check:
        'Check a read with isProblem from @robkit/input, not "error" in. See robkit\'s docs/conventions/input.md.',
      thrown:
        "A problem the person can fix isn't a fault. Throw it as a CommandProblem in a command line, end an app server with orExit, or use orThrow where nothing better fits. See robkit's docs/conventions/input.md.",
    },
    schema: [],
  },
  create(context) {
    const inTest = isTestFile(context.filename);
    return {
      /** @param {any} node */
      TSTypeLiteral(node) {
        if (isErrorShape(node)) context.report({ node, messageId: "type" });
      },
      /** @param {any} node */
      "ThrowStatement > NewExpression"(node) {
        const [message] = node.arguments;
        if (
          !inTest &&
          node.callee.type === "Identifier" &&
          node.callee.name === "Error" &&
          message?.type === "MemberExpression" &&
          !message.computed &&
          message.property.type === "Identifier" &&
          message.property.name === "error"
        ) {
          context.report({ node, messageId: "thrown" });
        }
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
