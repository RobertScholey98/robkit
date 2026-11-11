import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { sections } from "./navigation.ts";

// What a docs page says about itself. The sidebar and its order come
// from this, through buildNavigation(). A page that leaves out a field
// the schema needs stops the build, and Astro names the page's file.
const docs = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(sections),
    /** Its place in its section. A page with none comes after those with one. */
    order: z.number().int().optional(),
  }),
});

export const collections = { docs };
