import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeInstall } from "./write.ts";

describe("writeInstall", () => {
  it("writes each file under the folder, making its parents", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");

    await writeInstall(
      dir,
      new Map([
        ["robkit.json", "{}\n"],
        ["apps/core/src/main.ts", "export {};\n"],
      ]),
    );

    expect(await readFile(join(dir, "robkit.json"), "utf8")).toBe("{}\n");
    expect(await readFile(join(dir, "apps/core/src/main.ts"), "utf8")).toBe(
      "export {};\n",
    );
  });

  it("refuses a folder that already holds files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(dir, "notes.txt"), "mine");

    await expect(
      writeInstall(dir, new Map([["robkit.json", "{}\n"]])),
    ).rejects.toThrow(`${dir} isn't empty. Choose a new folder.`);
    expect(await readFile(join(dir, "notes.txt"), "utf8")).toBe("mine");
  });
});
