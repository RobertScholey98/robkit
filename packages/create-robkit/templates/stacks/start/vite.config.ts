import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. src/server.ts
// puts robkit's guard in front of Start.
export default defineConfig({
  plugins: [
    robkit(),
    tanstackStart({ router: { addExtensions: true } }),
    react(),
    tailwindcss(),
  ],
});
