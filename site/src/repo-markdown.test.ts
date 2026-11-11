import { describe, expect, it } from "vitest";
import {
  anchorOf,
  glossaryMarkdown,
  glossaryTerms,
  linksToGitHub,
  listAfter,
  listIn,
  sectionUnder,
} from "./repo-markdown.ts";

describe("sectionUnder", () => {
  const file = [
    "# Top",
    "## One",
    "Under one.",
    "### Inner",
    "Under inner.",
    "## Two",
    "Under two.",
  ].join("\r\n");

  it("takes the lines up to the next heading at its level or above", () => {
    expect(sectionUnder(file, "## One", "F.md")).toBe(
      "Under one.\n### Inner\nUnder inner.",
    );
    expect(sectionUnder(file, "### Inner", "F.md")).toBe("Under inner.");
  });

  it("runs to the end of the file under the last heading", () => {
    expect(sectionUnder(file, "## Two", "F.md")).toBe("Under two.");
  });

  it.each(["## Three", "One"])(
    "names the file when it has no %j",
    (heading) => {
      expect(() => sectionUnder(file, heading, "F.md")).toThrow(
        `F.md has no heading "${heading}".`,
      );
    },
  );
});

describe("listAfter", () => {
  const file = "Intro.\n\nThe ways in:\n\n- one\n- two\n\nAfter.\n";

  it("takes the list after the paragraph that starts with the words", () => {
    expect(listAfter(file, "The ways in", "F.md")).toBe("- one\n- two");
  });

  it.each([
    ["no such paragraph", "The ways out"],
    ["no list after it", "- one"],
    ["nothing after it", "After."],
  ])("names the file when it has %s", (_, leadIn) => {
    expect(() => listAfter(file, leadIn, "F.md")).toThrow(
      `F.md has no list after a paragraph that starts "${leadIn}".`,
    );
  });
});

describe("listIn", () => {
  it("takes the first list", () => {
    expect(listIn("Intro.\r\n\r\n- one\r\n- two\r\n\r\n- three\r\n", "F")).toBe(
      "- one\n- two",
    );
  });

  it("names the file when it has none", () => {
    expect(() => listIn("Intro.\n", "F.md's gaps")).toThrow(
      "F.md's gaps has no list.",
    );
  });
});

describe("linksToGitHub", () => {
  it("sends a relative link to its file on GitHub, from the file's folder", () => {
    expect(
      linksToGitHub(
        "[Ticket 29](.scratch/x/29.md) and [the ADRs](../adr/README.md#top)",
        "docs/architecture.md",
      ),
    ).toBe(
      "[Ticket 29](https://github.com/RobertScholey98/robkit/blob/main/docs/.scratch/x/29.md) and [the ADRs](https://github.com/RobertScholey98/robkit/blob/main/adr/README.md#top)",
    );
  });

  it("leaves a link with a scheme, or to an anchor, as it is", () => {
    const text =
      "[a](https://example.com/x) [b](mailto:r@example.com) [c](#gaps)";

    expect(linksToGitHub(text, "SECURITY.md")).toBe(text);
  });
});

describe("anchorOf", () => {
  it.each([
    ["Owner", "owner"],
    ["Core's origin", "cores-origin"],
    ["UI kit", "ui-kit"],
  ])("gives %j the anchor %j", (term, anchor) => {
    expect(anchorOf(term)).toBe(anchor);
  });
});

describe("the glossary", () => {
  const glossary = `# robkit

Intro.

## Language

### People

**Owner**:
The one person who runs an **Install**.
_Avoid_: user

**Guest**:
Anyone with an **Access code**, unlike the **Owners**. Not **bold**.

### Platform

**Install**:
One deployment.

## Relationships

- An **Install** has one **Owner**.
`;

  it("lists each term", () => {
    expect(glossaryTerms(glossary)).toEqual(["Owner", "Guest", "Install"]);
  });

  it("makes each group a section and each term a heading, linking the terms it names", () => {
    expect(glossaryMarkdown(glossary)).toBe(`## People

### Owner

The one person who runs an [Install](#install).

### Guest

Anyone with an **Access code**, unlike the [Owners](#owner). Not **bold**.

## Platform

### Install

One deployment.`);
  });

  it("has a term added to the file, with no other change", () => {
    const added = glossary.replace(
      "## Relationships",
      "**Hub**:\nThe launcher.\n\n## Relationships",
    );

    expect(glossaryMarkdown(added)).toContain("### Hub\n\nThe launcher.");
  });
});
