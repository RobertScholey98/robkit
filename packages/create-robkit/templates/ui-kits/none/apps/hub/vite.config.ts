import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const domain = process.env.ROBKIT_DOMAIN;

// robkit-dev assigns PORT and serves the hub on hub.<domain> through its proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    ...(process.env.PORT && {
      port: Number(process.env.PORT),
      strictPort: true,
    }),
    ...(domain && { allowedHosts: [`hub.${domain}`] }),
  },
});
