// The docs' navigation, built from what each page says about itself in its
// front matter: the sidebar's sections, and each page's previous and next
// page. Nobody keeps a list of pages by hand.

/** The sidebar's sections, in the order the PRD gives them. */
export const sections = [
  "Get started",
  "Build an app",
  "Run an install",
  "Deploy",
  "Concepts",
  "Reference",
] as const;

export type Section = (typeof sections)[number];

/** What the navigation needs from a page's front matter. */
export interface PageInfo {
  /** The page's id in the docs collection, such as `get-started/quickstart`. */
  id: string;
  title: string;
  section: Section;
  /** Its place in its section. A page with none comes after those with one. */
  order?: number | undefined;
}

export interface NavLink {
  id: string;
  title: string;
  href: string;
}

export interface Place {
  section: Section;
  previous: NavLink | undefined;
  next: NavLink | undefined;
}

export interface Navigation {
  /** The sections that have pages, in order, each with its pages in order. */
  sections: { title: Section; pages: NavLink[] }[];
  /** Each page's section and neighbours, by id, in reading order. */
  places: Record<string, Place>;
}

const byPlace = (a: PageInfo, b: PageInfo) =>
  (a.order ?? Infinity) - (b.order ?? Infinity) ||
  a.title.localeCompare(b.title, "en");

const link = ({ id, title }: PageInfo): NavLink => ({
  id,
  title,
  href: `/docs/${id}/`,
});

/** Builds the sidebar and each page's neighbours from the pages' front matter. */
export function buildNavigation(pages: PageInfo[]): Navigation {
  const grouped = sections
    .map((title) => ({
      title,
      pages: pages.filter((page) => page.section === title).sort(byPlace),
    }))
    .filter((section) => section.pages.length > 0);
  const reading = grouped.flatMap((section) => section.pages);
  const places: Record<string, Place> = {};
  reading.forEach((page, index) => {
    const previous = reading[index - 1];
    const next = reading[index + 1];
    places[page.id] = {
      section: page.section,
      previous: previous && link(previous),
      next: next && link(next),
    };
  });
  return {
    sections: grouped.map(({ title, pages: inSection }) => ({
      title,
      pages: inSection.map(link),
    })),
    places,
  };
}
