import { migrate } from "@robkit/core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

await migrate(databaseUrl);
console.log("core migrated");
