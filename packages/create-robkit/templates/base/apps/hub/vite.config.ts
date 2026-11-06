import { isProblem, readDevServerEnv } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devServerEnv = readDevServerEnv(process.env);
if (isProblem(devServerEnv)) throw new Error(devServerEnv.error);
const { port, domain } = devServerEnv;

// robkit-dev assigns PORT and serves the hub on hub.<domain> through its proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    ...(port && { port, strictPort: true }),
    ...(domain && { allowedHosts: [`.${domain}`] }),
  },
});
