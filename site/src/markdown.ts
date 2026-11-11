// The Markdown copy of a built docs page, for an agent or anyone who'd
// rather read text. It holds what a reader of the page sees, not the MDX
// it came from: every stack's sample under its name, each file's code in a
// fence that names it, callouts as quoted text, and diagrams as their
// words. Controls, icons and the page's frame stay out.

import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { codeLabel, isCommand } from "./code.ts";
import { docsPageOf } from "./docs-page.ts";

type Root = ReturnType<typeof fromHtml>;
type Node = Root["children"][number];
type Element = Extract<Node, { type: "element" }>;
type Child = Element["children"][number];

const has = (node: Element, name: string) =>
  String(node.properties.className).split(",").includes(name);

const element = (
  tagName: string,
  children: Child[],
  properties: Element["properties"] = {},
): Element => ({ type: "element", tagName, properties, children });

const text = (value: string): Child => ({ type: "text", value });

/** The text inside `nodes`, as it is, newlines included. */
function textOf(nodes: (Node | Child)[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      return node.type === "element" ? textOf(node.children) : "";
    })
    .join("");
}

/** Every element under `node` that `test` accepts, outermost first. */
function elementsIn(node: Element, test: (each: Element) => boolean) {
  return node.children.flatMap((child): Element[] => {
    if (child.type !== "element") return [];
    return test(child) ? [child] : elementsIn(child, test);
  });
}

/** What doesn't belong in the text: controls, icons and live regions. */
const isLeftOut = (node: Element) =>
  node.tagName === "button" ||
  node.tagName === "script" ||
  node.tagName === "style" ||
  node.properties.ariaHidden === "true" ||
  node.properties.role === "status" ||
  node.properties.role === "tablist" ||
  (node.tagName === "svg" && node.properties.role !== "img");

/**
 * A code block's frame as one element the Markdown handler below turns
 * into a fence. Its code rides in a property, so whitespace handling
 * leaves its lines alone.
 */
function codeBlock(figure: Element): Element {
  const pres = elementsIn(figure, (each) => each.tagName === "pre");
  const lang = pres.map((pre) => String(pre.properties.dataLanguage)).join("");
  // The bar names the file, or says "Terminal" or the language.
  const label = textOf(
    plain(elementsIn(figure, (each) => has(each, "label"))),
  ).trim();
  const named = !isCommand(lang) && label !== codeLabel(lang);
  return element("robkit-code", [], {
    dataLang: lang,
    dataTitle: named ? label : undefined,
    dataCode: textOf(pres).replace(/\n+$/, ""),
  });
}

/** A callout as a quote that starts with its kind, "Note" or "Warning". */
const quote = (callout: Element): Element =>
  element("blockquote", [
    element("p", [
      element("strong", [
        text(textOf(elementsIn(callout, (each) => has(each, "kind"))).trim()),
      ]),
    ]),
    ...elementsIn(callout, (each) => has(each, "body")).flatMap(
      (body) => body.children,
    ),
  ]);

/** A diagram as the words it carries for a reader who can't see it. */
const diagram = (svg: Element): Element =>
  element("p", [
    text(
      `Diagram: ${elementsIn(svg, (each) =>
        ["title", "desc"].includes(each.tagName),
      )
        .map((each) => textOf([each]).trim())
        .join(". ")}`,
    ),
  ]);

/** `children`, with each piece of the site made plain. */
function plain(children: Child[]): Child[] {
  return children.flatMap((child): Child[] => {
    if (child.type === "comment") return [];
    if (child.type === "text") return [child];
    if (isLeftOut(child)) return [];
    if (child.tagName === "figure" && has(child, "code")) {
      return [codeBlock(child)];
    }
    if (child.tagName === "div" && has(child, "callout")) {
      return [quote({ ...child, children: plain(child.children) })];
    }
    if (child.tagName === "svg") return [diagram(child)];
    if (child.tagName === "p" && has(child, "name")) {
      return [element("p", [element("strong", plain(child.children))])];
    }
    if (child.tagName === "span" && has(child, "about")) {
      return [text(" "), ...plain(child.children)];
    }
    return [{ ...child, children: plain(child.children) }];
  });
}

/** The children of an HTML fragment, without its doctype. */
const parsed = (html: string): Child[] =>
  fromHtml(html, { fragment: true }).children.filter(
    (node) => node.type !== "doctype",
  );

/**
 * The Markdown of the built docs page at `href`: its title, its lead and
 * its prose. A link to a heading on the page leads to the page's address,
 * since the Markdown's headings have no ids. Undefined for a page with no
 * docs prose.
 */
export function markdownOf(html: string, href: string): string | undefined {
  const parts = docsPageOf(html);
  if (parts === undefined) return undefined;
  const { title, lead } = parts;
  const prose = parts.prose.replaceAll('href="#', `href="${href}#`);
  const page: Root = {
    type: "root",
    children: [
      element("h1", plain(parsed(title))),
      element("p", plain(parsed(lead))),
      ...plain(parsed(prose)),
    ],
  };
  const mdast = toMdast(page, {
    handlers: {
      "robkit-code": (state, node) => {
        const { dataLang, dataTitle, dataCode } = node.properties;
        const result = {
          type: "code" as const,
          lang: String(dataLang),
          meta: typeof dataTitle === "string" ? `title="${dataTitle}"` : null,
          value: String(dataCode),
        };
        state.patch(node, result);
        return result;
      },
    },
  });
  return toMarkdown(mdast, {
    extensions: [gfmToMarkdown()],
    bullet: "-",
    emphasis: "_",
    fences: true,
    rule: "-",
  });
}
