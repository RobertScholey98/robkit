// Writes what an install takes from this checkout into dist/carried.json:
// the catalog, pnpm's version, each package's version, the lint policy and
// the Go module. The built generator reads it there, so the published
// package needs no checkout. The build runs it after tsc:
//
//   pnpm --filter create-robkit build
//
// turbo.json names each file it reads as an input to create-robkit#build,
// so a cached build never carries an old catalog.
import { fileURLToPath } from "node:url";
import { runCommand } from "@robkit/dev/cli";
import { carry } from "../src/robkit-repo.ts";

process.exitCode = await runCommand(async () => {
  await carry(fileURLToPath(new URL("../dist/carried.json", import.meta.url)));
  return 0;
});
