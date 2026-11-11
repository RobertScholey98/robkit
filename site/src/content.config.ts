import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { sections } from "./navigation.ts";

// What a docs page says about itself. The sidebar, the order and the
// previous and next links come from this, through buildNavigation(). A
// page that leaves out a field the schema needs stops the build, and
// Astro names the page's file.
const docs = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
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

export const collections = { docs };
