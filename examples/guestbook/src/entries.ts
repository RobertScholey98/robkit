import { desc } from "drizzle-orm";
import { database } from "./database.ts";
import { entry } from "./schema.ts";

export interface Entry {
  name: string;
  message: string;
}

/** Every message, newest first. */
export async function listEntries(): Promise<Entry[]> {
  return database()
    .select({ name: entry.name, message: entry.message })
    .from(entry)
    .orderBy(desc(entry.at), desc(entry.id));
}

/** Leaves a message. */
export async function sign(signed: Entry): Promise<void> {
  await database().insert(entry).values(signed);
}
