import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Admin } from "./Admin.tsx";
import { Root } from "./ui.tsx";
import "./index.css";

const root = document.getElementById("root");
const core = document
  .querySelector('meta[name="robkit-core"]')
  ?.getAttribute("content");
if (!root || !core) throw new Error("admin's page has no #root or core origin");

createRoot(root).render(
  <StrictMode>
    <Root>
      <Admin core={core} />
    </Root>
  </StrictMode>,
);
