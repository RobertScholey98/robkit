import { migrate } from "@robkit/core";
import { orExit, readDatabaseUrl } from "@robkit/input";

const databaseUrl = orExit(readDatabaseUrl(process.env));

await migrate(databaseUrl);
console.log("core migrated");
