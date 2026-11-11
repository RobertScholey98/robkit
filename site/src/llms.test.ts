import { describe, expect, it } from "vitest";
import { llmsText } from "./llms.ts";
import { readPages } from "./pages.ts";
import { built, origin } from "./test/built.ts";

describe("llmsText", () => {
  it("lists each page's Markdown copy with its description, by section in reading order", () => {
    const text = llmsText(
      new URL("https://robkit.dev"),
      "robkit is a kit for self-hosting small apps.",
      [
        {
          id: "reference/settings",
          data: {
            title: "Every setting",
            description: "Each setting robkit reads.",
            section: "Reference",
          },
        },
        {
          id: "get-started/quickstart",
          data: {
            title: "Quickstart",
            description: "Make an install.",
            section: "Get started",
            order: 2,
          },
        },
        {
          id: "get-started/what-you-need",
          data: {
            title: "What you need",
            description: "Node, pnpm and Docker.",
            section: "Get started",
            order: 1,
          },
        },
      ],
    );

    expect(text).toBe(`# robkit

> robkit is a kit for self-hosting small apps.

Each page below is Markdown. The same page as HTML is at its address without \`.md\`.

## Get started

- [What you need](https://robkit.dev/docs/get-started/what-you-need.md): Node, pnpm and Docker.
- [Quickstart](https://robkit.dev/docs/get-started/quickstart.md): Make an install.

## Reference

- [Every setting](https://robkit.dev/docs/reference/settings.md): Each setting robkit reads.
`);
  });
});

describe("the built site's llms.txt", () => {
  it("starts with what robkit is", async () => {
    expect(await built("llms.txt")).toMatch(/^# robkit\n\n> robkit is a kit /);
  });

  it("lists every docs page's Markdown copy, with its description", async () => {
    const llms = await built("llms.txt");
    const listed = [...llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\): \S.*$/gm)].map(
      ([, url]) => String(url),
    );

    expect(listed.toSorted()).toEqual(
      (await readPages()).map(({ id }) => `${origin}/docs/${id}.md`).toSorted(),
    );
  });
});
