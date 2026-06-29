import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initClientLogging, logInfo } from "./lib/observability/logger";
import "./styles/globals.css";

initClientLogging();
logInfo("app.bootstrap", { component: "main" });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
