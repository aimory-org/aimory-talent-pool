import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true, // Listen on all interfaces (needed for dev containers)
    port: 5174,
    strictPort: true,
    hmr: {
      clientPort: 5174, // Use same port for HMR WebSocket
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "src/data/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "src/main.tsx",
        "src/lib/auth.ts",
        "src/components/HowItWorks/",
        "src/components/ui/theme-toggle.tsx",
      ],
    },
  },
});
