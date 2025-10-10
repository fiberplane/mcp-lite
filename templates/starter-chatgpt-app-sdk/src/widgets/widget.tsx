import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "./index.css";
import { router } from "./routes";

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App element not found");
}

const root = createRoot(appElement);
root.render(<RouterProvider router={router} />);
