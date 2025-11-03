import React from "react";
import ReactDOM from "react-dom/client";
import WeatherWidget from "./WeatherWidget";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <WeatherWidget />
    </React.StrictMode>,
  );
}
