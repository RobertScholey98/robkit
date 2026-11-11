import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./home.tsx";
import "./styles.css";

const root = document.createElement("div");
document.body.append(root);
createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
