import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. The hub has no
// guard, so it checks no guard settings and sends the hub's own headers.
export default defineConfig({
  plugins: [robkit({ guarded: false }), react(), tailwindcss()],
});
