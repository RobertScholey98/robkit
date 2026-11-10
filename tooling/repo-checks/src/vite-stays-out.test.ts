import { describe, expect, it } from "vitest";
import { readPublishedManifests, viteNamedProblems } from "./vite-stays-out.ts";

const problem = (path: string, field: string) =>
  `${path} names vite under ${field}. Only @robkit/vite may, since an app lists it under devDependencies; a package an app runs on would put Vite in its production image. Move what needs Vite into @robkit/vite.`;

describe("viteNamedProblems", () => {
  it.each(["dependencies", "peerDependencies", "optionalDependencies"])(
    "fails a published package that names vite under %s",
    (field) => {
      const manifests = [
        {
          path: "packages/express/package.json",
          json: { name: "@robkit/express", [field]: { vite: "^8.0.0" } },
        },
      ];

      expect(viteNamedProblems(manifests)).toEqual([
        problem("packages/express/package.json", field),
      ]);
    },
  );

  it("lets @robkit/vite name it, and any package take it to test with", () => {
    const manifests = [
      {
        path: "packages/vite/package.json",
        json: { name: "@robkit/vite", peerDependencies: { vite: "^8.0.0" } },
      },
      {
        path: "packages/hono/package.json",
        json: { name: "@robkit/hono", devDependencies: { vite: "catalog:" } },
      },
    ];

    expect(viteNamedProblems(manifests)).toEqual([]);
  });

  it("passes every package robkit publishes", async () => {
    expect(viteNamedProblems(await readPublishedManifests())).toEqual([]);
  });
});
