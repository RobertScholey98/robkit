import { migrate } from "@robkit/core";
import { isProblem, readDatabaseUrl } from "@robkit/session/input";

const databaseUrl = readDatabaseUrl(process.env);
if (isProblem(databaseUrl)) {
  console.error(databaseUrl.error);
  process.exit(1);
}

await migrate(databaseUrl);
console.log("core migrated");
