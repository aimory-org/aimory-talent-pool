/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { server } from "./mocks/server";

// Reset handlers and cleanup after each test
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

// Close MSW server after all tests
afterAll(() => {
  server.close();
});

// Mock window.matchMedia for components that use it
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverMock;

// Set test environment variables
vi.stubEnv("VITE_API_ENDPOINT", "https://api.test.com");
vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "us-east-1_test123");
vi.stubEnv("VITE_COGNITO_CLIENT_ID", "test-client-id");
vi.stubEnv("VITE_COGNITO_DOMAIN", "test.auth.us-east-1.amazoncognito.com");
