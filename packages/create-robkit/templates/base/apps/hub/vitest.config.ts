import { defineConfig } from "vitest/config";

// The hub finds core from its own address, so a test page that draws the
// hub opens on hub.<domain>.
export default defineConfig({
  test: {
    environmentOptions: { happyDOM: { url: "https://hub.robkit.test/" } },
  },
});
