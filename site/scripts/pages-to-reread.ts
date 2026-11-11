// Prints the docs pages that describe the files you changed, so you know
// which pages to read again. It fails nothing.
//
//   pnpm --filter @internal/site pages-to-reread packages/dev/src/checks.ts
//   git diff --name-only origin/main | pnpm --filter @internal/site pages-to-reread
//
// Paths are from the repo root, as git prints them.

import { text } from "node:stream/consumers";
import { pagesDescribing, readPages } from "../src/pages.ts";

const changed =
  process.argv.length > 2
    ? process.argv.slice(2)
    : process.stdin.isTTY
      ? []
      : (await text(process.stdin)).split(/\r?\n/);

const found = pagesDescribing(await readPages(), changed);
if (found.length === 0) {
  console.log("No docs page describes these files.");
} else {
  console.log("Read these docs pages again:");
  for (const { page, changed: files } of found) {
    console.log(`\n${page.file} (${page.title})`);
    for (const file of files) console.log(`  describes ${file}`);
  }
}
