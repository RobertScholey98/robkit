import { describe, expect, it } from "vitest";
import { quickstartCommands } from "./readme.ts";

describe("quickstartCommands", () => {
  it("reads the first sh fence under the Quickstart heading", () => {
    const readme = [
      "# robkit",
      "",
      "```sh",
      "not this one",
      "```",
      "",
      "## Quickstart",
      "",
      "You need Node.",
      "",
      "```sh",
      "npm create robkit my-install",
      "cd my-install",
      "",
      "pnpm dev",
      "```",
      "",
      "```sh",
      "nor this one",
      "```",
    ].join("\n");

    expect(quickstartCommands(readme, "README.md")).toEqual([
      "npm create robkit my-install",
      "cd my-install",
      "pnpm dev",
    ]);
  });

  it("reads a README whose lines end in \\r\\n", () => {
    const readme = "## Quickstart\r\n\r\n```sh\r\npnpm dev\r\n```\r\n";

    expect(quickstartCommands(readme, "README.md")).toEqual(["pnpm dev"]);
  });

  it("names the file when it has no Quickstart heading", () => {
    expect(() =>
      quickstartCommands("# robkit\n\n```sh\npnpm dev\n```\n", "README.md"),
    ).toThrow(
      'README.md has no sh fence under "## Quickstart", which the home page shows.',
    );
  });

  it("names the file when its Quickstart has no sh fence", () => {
    expect(() =>
      quickstartCommands("## Quickstart\n\nRun pnpm dev.\n", "README.md"),
    ).toThrow(
      'README.md has no sh fence under "## Quickstart", which the home page shows.',
    );
  });
});
