import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Admin } from "./Admin.tsx";
import "./index.css";

const root = document.getElementById("root");
const core = document
  .querySelector('meta[name="robkit-core"]')
  ?.getAttribute("content");
if (!root || !core) {
  const missing = root ? "robkit-core meta tag" : "#root element";
  throw new Error(
    `Admin's page at ${location.href} has no ${missing}. Admin's server writes both into the page, in apps/admin/src/server.ts.`,
  );
}

createRoot(root).render(
  <StrictMode>
    <Admin core={core} />
  </StrictMode>,
);
