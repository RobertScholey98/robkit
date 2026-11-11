import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { builtParts } from "./built.ts";
import { sections } from "./navigation.ts";

// What a docs page says about itself. The sidebar, the order and the
// previous and next links come from this, through buildNavigation(). A
// page that leaves out a field the schema needs stops the build, and
// Astro names the page's file.
const docs = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    /** What the page holds, in a line. The lead, link previews and llms.txt show it. */
    description: z.string().trim().min(1),
    section: z.enum(sections),
    /** Its place in its section. A page with none comes after those with one. */
    order: z.number().int().optional(),
    /** Not written yet: the page shows its first paragraph and says so. */
    stub: z.boolean().default(false),
    /** Repo files the page describes, from the repo root. A folder ends in `/`. */
    describes: z.array(z.string()).default([]),
    /** The repo file the page is built from, when it isn't its own MDX file. */
    source: z.string().optional(),
  }),
});

// The parts of pages built from the repo's own files, such as GLOSSARY.md,
// rendered as Astro renders a Markdown page. Each is read again on every
// build, so the page follows its file.
const built = defineCollection({
  loader: {
    name: "robkit:built",
    load: async (context) => {
      context.store.clear();
      for (const [id, build] of Object.entries(builtParts)) {
        const body = await build();
        const rendered = await context.renderMarkdown(body);
        context.store.set({ id, data: {}, body, rendered });
      }
    },
  },
  schema: z.object({}),
});

export const collections = { docs, built };
