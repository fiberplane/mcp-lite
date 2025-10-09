import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { router } from "./routes";

const root = createRoot(document.getElementById("app")!);
root.render(<RouterProvider router={router} />);
