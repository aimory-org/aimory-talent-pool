import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import "./index.css";
import App from "./App.tsx";
import { getAmplifyConfig } from "@/lib/auth";

// Configure Amplify with Cognito settings (must happen at runtime for correct redirect URI)
Amplify.configure(getAmplifyConfig());

// Debug: Log all auth events
Hub.listen("auth", (data) => {
  console.log("Auth Hub event:", data.payload.event, data.payload);
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Failed to locate root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
