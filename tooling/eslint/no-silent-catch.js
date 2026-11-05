/**
 * @typedef {import("eslint").Rule.RuleContext} Context
 * @typedef {import("estree").Node} Node
 */

/**
 * Whether the error `node` binds is never read: no binding, or one nothing
 * uses. A destructured error counts as used.
 * @param {Context} context
 * @param {Node} node a CatchClause or a function
 * @param {Node | null | undefined} param
 */
function discardsError(context, node, param) {
  if (!param) return true;
  if (param.type !== "Identifier") return false;
  const variable = context.sourceCode
    .getDeclaredVariables(node)
    .find(({ name }) => name === param.name);
  return variable !== undefined && variable.references.length === 0;
}

/**
 * The statement `node` sits in, whose leading comment can speak for it.
 * @param {Node & { parent?: Node }} node
 */
function statementOf(node) {
  /** @type {(Node & { parent?: Node }) | undefined} */
  let current = node;
  while (
    current?.parent &&
    current.parent.type !== "Program" &&
    current.parent.type !== "BlockStatement" &&
    current.parent.type !== "StaticBlock"
  ) {
    current = current.parent;
  }
  return current;
}

/**
 * Whether a comment sits inside `node`, or directly above the statement
 * holding `statement`.
 * @param {Context} context
 * @param {Node} node
 * @param {Node} [statement]
 */
function explained(context, node, statement) {
  const { sourceCode } = context;
  if (sourceCode.getCommentsInside(node).length > 0) return true;
  if (!statement?.loc) return false;
  const above = sourceCode.getCommentsBefore(statement).at(-1);
  return (
    above?.loc !== undefined &&
    above.loc.end.line >= statement.loc.start.line - 1
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a catch that discards its error without a comment saying why",
    },
    messages: {
      silent:
        "This catch discards its error. Use it (translate, log or rethrow with cause), or say in a comment why dropping it is right.",
    },
    schema: [],
  },
  create(context) {
    return {
      CatchClause(node) {
        if (!discardsError(context, node, node.param)) return;
        if (explained(context, node)) return;
        context.report({ node, messageId: "silent" });
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "catch"
        ) {
          return;
        }
        const [handler] = node.arguments;
        if (
          handler?.type !== "ArrowFunctionExpression" &&
          handler?.type !== "FunctionExpression"
        ) {
          return;
        }
        if (!discardsError(context, handler, handler.params[0])) return;
        if (explained(context, handler, statementOf(node))) return;
        context.report({ node: handler, messageId: "silent" });
      },
    };
  },
};
