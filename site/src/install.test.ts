import { describe, expect, it } from "vitest";
import {
  goVersion,
  installGoVersion,
  installNodeVersion,
  nodeVersion,
} from "./install.ts";

describe("nodeVersion", () => {
  it("reads the lowest Node an install's engines field allows", () => {
    expect(nodeVersion({ engines: { node: ">=24" } }, "package.json")).toBe(
      "24",
    );
    expect(nodeVersion({ engines: { node: ">= 24.2" } }, "package.json")).toBe(
      "24.2",
    );
  });

  it("names the file when its engines field isn't a lowest version", () => {
    for (const json of [
      {},
      { engines: "24" },
      { engines: { node: "^24" } },
      [],
    ]) {
      expect(() => nodeVersion(json, "package.json")).toThrow(
        'package.json needs an engines.node of the form ">=24", which the docs show as the Node an install needs.',
      );
    }
  });
});

describe("goVersion", () => {
  it("reads the go line of a go.mod, to its minor version", () => {
    expect(goVersion("module app\n\ngo 1.26.0\n", "go.mod")).toBe("1.26");
    expect(goVersion("module app\r\ngo 1.27\r\n", "go.mod")).toBe("1.27");
  });

  it("names the file when it has no go line", () => {
    expect(() => goVersion("module app\n", "go.mod")).toThrow(
      'go.mod has no "go 1.N" line, which the docs show as the Go a React + Go app needs.',
    );
  });
});

describe("the templates", () => {
  it("give the Node and Go versions the docs show", async () => {
    expect(await installNodeVersion()).toMatch(/^\d+$/);
    expect(await installGoVersion()).toMatch(/^1\.\d+$/);
  });
});
