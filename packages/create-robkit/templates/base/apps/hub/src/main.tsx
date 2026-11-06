import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error(
    `The hub's page at ${location.href} has no #root element to draw in. Put <div id="root"></div> back in apps/hub/index.html.`,
  );
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
