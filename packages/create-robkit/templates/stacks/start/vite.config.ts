import { readCoreUrl, readDevServerEnv, orThrow } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const { port, domain } = orThrow(readDevServerEnv(process.env));

// robkit-dev assigns PORT and serves the app on <slug>.<domain> through its
// proxy. src/server.ts puts robkit's guard in front of Start.
export default defineConfig(({ command }) => {
  // Start loads the server entry on the first request, so check its config now.
  if (command === "serve") {
    orThrow(readCoreUrl(process.env));
  }
  return {
    plugins: [
      tanstackStart({ router: { addExtensions: true } }),
      react(),
      tailwindcss(),
    ],
    server: {
      host: "127.0.0.1",
      ...(port && { port, strictPort: true }),
      ...(domain && { allowedHosts: [`.${domain}`] }),
    },
  };
});
