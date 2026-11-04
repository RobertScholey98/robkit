import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, Provider } from "./index.ts";

/** The CSS a server-rendered page carries in its <style> tags. */
function serverCss(): string {
  const html = renderToString(
    <Provider>
      <Button>Go</Button>
    </Provider>,
  );
  return [...html.matchAll(/<style[^>]*>([^<]*)<\/style>/g)]
    .map(([, css = ""]) => css)
    .join("\n");
}

describe("Provider", () => {
  it("server-renders the palette every component draws with", () => {
    const css = serverCss();

    expect(css).toContain(
      "--chakra-colors-color-palette-solid:var(--chakra-colors-gray-solid)",
    );
    expect(css).toContain("--chakra-colors-gray-solid:var(--primary)");
  });

  it("server-renders no at-rule that runs into the next", () => {
    // A browser drops an at-rule whose prelude runs into another, and the
    // rules inside it with it, as an empty @layer once did.
    expect(serverCss()).not.toMatch(/@[\w-]+ [^{};]*@/);
  });
});
