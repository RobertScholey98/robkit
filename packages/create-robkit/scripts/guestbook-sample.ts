// Rewrites examples/guestbook as robkit export writes it from a fresh
// install of this robkit, so its shared/ code and versions match the
// install's again:
//
//   pnpm --filter create-robkit guestbook-sample
//
// Run it after a change to the install's packages, its catalog or what
// export writes. A test fails until the sample matches.
import { rm } from "node:fs/promises";
import { writeTree } from "../src/sharing.ts";
import { exportedGuestbook, guestbookDir } from "../src/test/guestbook.ts";

const tree = await exportedGuestbook();
await rm(guestbookDir, { recursive: true, force: true });
await writeTree(guestbookDir, tree);
console.log(`Rewrote ${guestbookDir}`);
