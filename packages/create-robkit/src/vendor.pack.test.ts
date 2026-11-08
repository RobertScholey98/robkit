import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { vendorPackages } from "./vendor.ts";

// Builds and packs every robkit package this checkout links, so it runs in
// `test` and not `test:unit`. vendor.test.ts covers the rest with a fake
// checkout.

async function overridesOf(dir: string): Promise<Record<string, string>> {
  const workspace = parse(
    await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
  ) as { overrides?: Record<string, string> };
  return workspace.overrides ?? {};
}

describe("vendorPackages", () => {
  it("packs each linked package into vendor/robkit and points the install at the tarballs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-vendor-"));
    await init(defaultChoices, dir, { link: true });
    const before = await overridesOf(dir);
    const linked = Object.keys(before).filter((name) =>
      before[name]?.startsWith("link:"),
    );

    await vendorPackages(dir);

    const overrides = await overridesOf(dir);
    expect(Object.keys(overrides)).toEqual(Object.keys(before));
    // The override that isn't a link stays as it was.
    expect(overrides["styled-jsx>@babel/core"]).toBe("-");
    for (const name of linked) {
      const spec = overrides[name];
      const tarball = `vendor/robkit/${name.replace("@", "").replace("/", "-")}-0.0.0.tgz`;
      expect(spec).toBe(`file:${tarball}`);
      await access(join(dir, tarball));
    }
    // And robkit's Go module, from the checkout's go folder.
    await access(join(dir, "vendor/robkit/go/session/guarded.go"));
  });
});
