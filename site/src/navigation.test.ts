import { describe, expect, it } from "vitest";
import { buildNavigation, docsFolders, type PageInfo } from "./navigation.ts";

const page = (
  id: string,
  section: PageInfo["section"],
  order?: number,
  title = id,
): PageInfo => ({ id, title, section, order });

const titles = (pages: PageInfo[]) =>
  buildNavigation(pages).sections.map(({ title, pages: inSection }) => [
    title,
    inSection.map((entry) => entry.title),
  ]);

describe("buildNavigation", () => {
  it("orders a section's pages by their order", () => {
    expect(
      titles([
        page("c", "Get started", 3),
        page("a", "Get started", 1),
        page("b", "Get started", 2),
      ]),
    ).toEqual([["Get started", ["a", "b", "c"]]]);
  });

  it("puts the sections in the PRD's order, and leaves out an empty one", () => {
    expect(
      titles([
        page("ref", "Reference", 1),
        page("start", "Get started", 1),
        page("concept", "Concepts", 1),
        page("build", "Build an app", 1),
      ]),
    ).toEqual([
      ["Get started", ["start"]],
      ["Build an app", ["build"]],
      ["Concepts", ["concept"]],
      ["Reference", ["ref"]],
    ]);
  });

  it("sorts two pages with the same order by title", () => {
    expect(
      titles([
        page("x", "Build an app", 1, "React + Hono"),
        page("y", "Build an app", 1, "Next.js"),
      ]),
    ).toEqual([["Build an app", ["Next.js", "React + Hono"]]]);
  });

  it("puts a page with no order after those with one, by title", () => {
    expect(
      titles([
        page("z", "Concepts", undefined, "Glossary"),
        page("y", "Concepts", undefined, "Flow"),
        page("x", "Concepts", 9),
      ]),
    ).toEqual([["Concepts", ["x", "Flow", "Glossary"]]]);
  });

  it("links each page to the ones before and after it, across sections", () => {
    const { places } = buildNavigation([
      page("b", "Build an app", 1),
      page("a", "Get started", 1),
      page("r", "Reference", 1),
    ]);

    expect(places).toEqual({
      a: {
        section: "Get started",
        previous: undefined,
        next: { id: "b", title: "b", href: "/docs/b/" },
      },
      b: {
        section: "Build an app",
        previous: { id: "a", title: "a", href: "/docs/a/" },
        next: { id: "r", title: "r", href: "/docs/r/" },
      },
      r: {
        section: "Reference",
        previous: { id: "b", title: "b", href: "/docs/b/" },
        next: undefined,
      },
    });
  });

  it("gives one page no neighbours", () => {
    expect(buildNavigation([page("only", "Deploy")]).places).toEqual({
      only: { section: "Deploy", previous: undefined, next: undefined },
    });
  });
});

describe("docsFolders", () => {
  const folders = (pages: PageInfo[]) =>
    docsFolders(buildNavigation(pages)).map(({ href, title, first }) => [
      href,
      title,
      first.href,
    ]);

  it("leads /docs/ and each folder to its first page in reading order", () => {
    expect(
      folders([
        page("deploy/coolify", "Deploy", 2),
        page("get-started/quickstart", "Get started", 2),
        page("deploy/kamal", "Deploy", 1),
        page("get-started/what-you-need", "Get started", 1),
      ]),
    ).toEqual([
      ["/docs/", "Docs", "/docs/get-started/what-you-need/"],
      ["/docs/get-started/", "Get started", "/docs/get-started/what-you-need/"],
      ["/docs/deploy/", "Deploy", "/docs/deploy/kamal/"],
    ]);
  });

  it("gives every folder above a deeper page, and none to a page at the top", () => {
    expect(
      folders([page("about", "Concepts", 1), page("a/b/c", "Concepts", 2)]),
    ).toEqual([
      ["/docs/", "Docs", "/docs/about/"],
      ["/docs/a/", "Concepts", "/docs/a/b/c/"],
      ["/docs/a/b/", "Concepts", "/docs/a/b/c/"],
    ]);
  });

  it("has none with no pages", () => {
    expect(folders([])).toEqual([]);
  });
});
