import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeApp, writeInstall } from "./write.ts";

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

describe("writeApp", () => {
  async function anInstall(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "robkit-"));
    await mkdir(join(root, "apps/hub"), { recursive: true });
    return root;
  }

  it("writes the app's folder whole into apps/, leaving nothing in .robkit/", async () => {
    const root = await anInstall();

    await writeApp(
      root,
      "notes",
      new Map([
        ["package.json", "{}\n"],
        ["src/server.ts", "export {};\n"],
      ]),
    );

    expect(await readFile(join(root, "apps/notes/src/server.ts"), "utf8")).toBe(
      "export {};\n",
    );
    expect(await readdir(join(root, ".robkit"))).toEqual([]);
  });

  it("leaves nothing under apps/ when a write fails partway", async () => {
    const root = await anInstall();

    // A file, then a file inside it, which can't be written.
    const writing = writeApp(
      root,
      "notes",
      new Map([
        ["package.json", "{}\n"],
        ["package.json/nope", "{}\n"],
      ]),
    );

    await expect(writing).rejects.toThrow();
    expect(await readdir(join(root, "apps"))).toEqual(["hub"]);
    expect(await readdir(join(root, ".robkit"))).toEqual([]);
  });

  it("refuses an app folder that already exists", async () => {
    const root = await anInstall();

    await expect(
      writeApp(root, "hub", new Map([["package.json", "{}\n"]])),
    ).rejects.toThrow("apps/hub already exists. Choose another name.");
  });
});
