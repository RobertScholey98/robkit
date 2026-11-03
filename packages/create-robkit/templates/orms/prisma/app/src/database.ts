import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

let prisma: PrismaClient | undefined;

/** The app's database, as its own role, connected on first use. */
export function database(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // The app's tables are in its own schema, named after its slug.
  const schema = process.env.ROBKIT_APP;
  if (!schema) throw new Error("ROBKIT_APP is not set");
  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }, { schema }),
  });
  return prisma;
}
