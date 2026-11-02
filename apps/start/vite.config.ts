import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const domain = process.env.ROBKIT_DOMAIN;

// robkit-dev assigns PORT and serves the app on start.<domain>
// through its proxy. src/server.ts puts robkit's guard in front of Start.
export default defineConfig(({ command }) => {
  // Start loads the server entry on the first request, so check its config now.
  if (command === "serve" && !process.env.ROBKIT_CORE_URL) {
    throw new Error(
      "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it.",
    );
  }
  return {
    plugins: [tanstackStart({ router: { addExtensions: true } }), react()],
    server: {
      host: "127.0.0.1",
      ...(process.env.PORT && {
        port: Number(process.env.PORT),
        strictPort: true,
      }),
      ...(domain && { allowedHosts: [`start.${domain}`] }),
    },
  };
});
