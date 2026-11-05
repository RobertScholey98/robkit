import { asc } from "drizzle-orm";
import { database } from "./database.ts";
import { entry } from "./schema.ts";

export interface Entry {
  name: string;
  message: string;
}

/** Every signature, oldest first. */
export function listEntries(): Promise<Entry[]> {
  return database()
    .select({ name: entry.name, message: entry.message })
    .from(entry)
    .orderBy(asc(entry.id));
}

/** Adds a signature. */
export async function addEntry({ name, message }: Entry): Promise<void> {
  await database().insert(entry).values({ name, message });
}
