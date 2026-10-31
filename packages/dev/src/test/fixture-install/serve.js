import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";

const slug = basename(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
writeFileSync("started", "");

// An app with a database must find its migration already run.
if (databaseUrl && readFileSync("migrated", "utf8") !== databaseUrl) {
  console.error("started before its migration");
  process.exit(1);
}
if (process.env.FIXTURE_CRASH === slug) {
  setTimeout(() => process.exit(3), 1000);
}

createServer((_req, res) => {
  res.end(
    JSON.stringify({
      slug,
      domain: process.env.ROBKIT_DOMAIN,
      database: databaseUrl !== undefined,
    }),
  );
}).listen(Number(process.env.PORT), "127.0.0.1", () => {
  console.log(`listening on ${process.env.PORT}`);
});
