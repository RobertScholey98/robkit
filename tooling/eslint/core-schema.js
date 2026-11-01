import { workspaceOf } from "./layers.js";

const message =
  "Core's tables live in the core schema. Declare them with core.table() from schema.ts.";

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Keep core's tables in the core schema" },
    schema: [],
  },
  create(context) {
    if (workspaceOf(context.filename) !== "packages/core") return {};

    // pgTable puts a table in public, and pgSchema("x") in schema x, under
    // whatever local name they were imported as.
    const schemaNames = new Set();
    const namespaces = new Set();

    /** @param {import("estree").Node} node */
    function isPgSchema(node) {
      if (node.type === "Identifier") return schemaNames.has(node.name);
      return (
        node.type === "MemberExpression" &&
        node.object.type === "Identifier" &&
        namespaces.has(node.object.name) &&
        node.property.type === "Identifier" &&
        node.property.name === "pgSchema"
      );
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "drizzle-orm/pg-core") return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            namespaces.add(specifier.local.name);
          } else if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier"
          ) {
            if (specifier.imported.name === "pgTable") {
              context.report({ node: specifier, message });
            }
            if (specifier.imported.name === "pgSchema") {
              schemaNames.add(specifier.local.name);
            }
          }
        }
      },
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          namespaces.has(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "pgTable"
        ) {
          context.report({ node, message });
        }
      },
      CallExpression(node) {
        if (!isPgSchema(node.callee)) return;
        const [name] = node.arguments;
        if (name?.type !== "Literal" || name.value !== "core") {
          context.report({ node, message });
        }
      },
    };
  },
};
