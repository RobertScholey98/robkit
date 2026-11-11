import { robkit } from "@robkit/vite";
import { expressApp } from "@robkit/vite/express";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. expressApp()
// hands every request but Vite's own to the Express app, so the guard sees
// page loads, and loads it again after each change. For vite build, serve
// names the server's entry: robkit() builds it to dist/serve.js and the
// stylesheet its page links to dist/assets.
export default defineConfig({
  plugins: [
    robkit({ serve: "src/serve.ts" }),
    expressApp("/src/server.tsx"),
    tailwindcss(),
  ],
});
