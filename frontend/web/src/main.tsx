import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import "./index.css";
import App from "./App.tsx";
import { getAmplifyConfig } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

// Configure Amplify with Cognito settings (must happen at runtime for correct redirect URI)
Amplify.configure(getAmplifyConfig());

// Debug: Log all auth events
Hub.listen("auth", (data) => {
  console.log("Auth Hub event:", data.payload.event, data.payload);
});

// Apply initial theme before React hydrates to prevent flash
const storedTheme = localStorage.getItem("theme") as
  | "dark"
  | "light"
  | "system"
  | null;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme =
  storedTheme === "system"
    ? systemDark
      ? "dark"
      : "light"
    : storedTheme || "dark";
document.documentElement.classList.add(initialTheme);

const container = document.getElementById("root");

if (!container) {
  throw new Error("Failed to locate root element");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
