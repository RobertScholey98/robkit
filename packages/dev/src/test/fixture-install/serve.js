import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";

const slug = basename(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
// An app that takes a while to start, as a busy machine makes any app.
if (process.env.FIXTURE_SLOW_START === slug) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
writeFileSync("started", "");

// An app with a database must find its migration already run.
if (databaseUrl && readFileSync("migrated", "utf8") !== databaseUrl) {
  console.error("started before its migration");
  process.exit(1);
}
// Crashes once every app is listening, so the runner has running apps to
// stop however long each took to start. A fixed delay raced the slowest app.
if (process.env.FIXTURE_CRASH === slug) {
  setInterval(() => {
    const apps = readdirSync("..");
    if (apps.every((app) => existsSync(`../${app}/listening`))) {
      process.exit(3);
    }
  }, 50);
}

createServer((_req, res) => {
  res.end(
    JSON.stringify({
      slug,
      domain: process.env.ROBKIT_DOMAIN,
      core: process.env.ROBKIT_CORE_URL,
      app: process.env.ROBKIT_APP,
      apps: process.env.ROBKIT_APPS,
      database: databaseUrl !== undefined,
    }),
  );
}).listen(Number(process.env.PORT), "127.0.0.1", () => {
  writeFileSync("listening", "");
  console.log(`listening on ${process.env.PORT}`);
});
