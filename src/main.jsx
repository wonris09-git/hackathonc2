import React from "react";
import { createRoot } from "react-dom/client";
import { TideCloakContextProvider } from "@tidecloak/react";
import App from "./App.jsx";
import "./style.css";

const tidecloakConfig = {
  realm: "whispercloak",
  "auth-server-url": "http://localhost:8080/",
  "ssl-required": "external",
  resource: "whispercloak-frontend",
  "public-client": true,
  "confidential-port": 0
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TideCloakContextProvider config={tidecloakConfig}>
      <App />
    </TideCloakContextProvider>
  </React.StrictMode>
);
