import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
import { importApp } from "./import.ts";
import { init } from "./init.ts";
import { readTree } from "./sharing.ts";
import { exportedGuestbook, guestbookDir } from "./test/guestbook.ts";

/** A checkout on Windows may hold the sample with CRLF endings. */
const lf = (bytes: Buffer | undefined) =>
  bytes?.toString("utf8").replaceAll("\r\n", "\n");

describe("the guestbook sample", { timeout: 30_000 }, () => {
  it("is what robkit export writes for it from this robkit", async () => {
    const sample = await readTree(guestbookDir);

    const exported = await exportedGuestbook();

    const stale =
      "examples/guestbook is out of date. Run pnpm --filter create-robkit guestbook-sample.";
    expect([...sample.keys()], stale).toEqual([...exported.keys()]);
    for (const [path, bytes] of exported) {
      expect(lf(sample.get(path)), `${path}: ${stale}`).toBe(lf(bytes));
    }
  });

  it("imports into a fresh install using the install's own shared code", async () => {
    const install = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, install);

    const imported = await importApp(install, guestbookDir);

    expect(imported).toEqual({
      slug: "guestbook",
      name: "Guestbook",
      mapped: ["@internal/theme", "@internal/tsconfig", "@internal/ui"],
      kept: [],
      catalogued: [],
      differences: [],
    });
  });
});
