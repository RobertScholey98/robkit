// A brand, such as `RoleId` or `Slug`, says a reader checked the value.
// A cast to one skips the reader, so this rule refuses it everywhere, tests
// included: a test builds a branded value as the code does.

/**
 * Whether `type` is a brand: an intersection with a property keyed by a
 * `unique symbol`, such as `string & { readonly [roleIdBrand]: true }`. A
 * union or list of them counts, but an object that holds one doesn't, so a
 * test may still build a malformed one.
 * @param {import("typescript").TypeChecker} checker
 * @param {import("typescript").Type} type
 * @returns {boolean}
 */
function isBrand(checker, type) {
  if (type.isUnion()) return type.types.some((t) => isBrand(checker, t));
  if (type.isIntersection()) {
    return type.types.some((part) =>
      part
        .getProperties()
        .some((property) => String(property.escapedName).startsWith("__@")),
    );
  }
  if (checker.isArrayType(type)) {
    return checker
      .getTypeArguments(/** @type {any} */ (type))
      .some((t) => isBrand(checker, t));
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Refuse a cast to a branded type" },
    messages: {
      cast: "Only a reader makes a branded value. Call the reader, or in a test a builder from @internal/test-session or @internal/test-addresses, rather than casting.",
    },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const program = services?.program;
    if (!program || !services.esTreeNodeToTSNodeMap) return {};
    const checker = program.getTypeChecker();
    const map = services.esTreeNodeToTSNodeMap;
    /** @param {any} node */
    function check(node) {
      const target = checker.getTypeFromTypeNode(map.get(node.typeAnnotation));
      if (isBrand(checker, target)) context.report({ node, messageId: "cast" });
    }
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};
