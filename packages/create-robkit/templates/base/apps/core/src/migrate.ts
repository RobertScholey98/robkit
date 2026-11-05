import { migrate } from "@robkit/core";
import { readDatabaseUrl } from "@robkit/session/input";

const databaseUrl = readDatabaseUrl(process.env);
if (typeof databaseUrl !== "string") {
  console.error(databaseUrl.error);
  process.exit(1);
}

await migrate(databaseUrl);
console.log("core migrated");
