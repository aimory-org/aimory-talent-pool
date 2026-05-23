/**
 * Tests for App.tsx authentication flow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/lib/theme";

// Mock aws-amplify modules before importing App
const mockFetchAuthSession = vi.fn();
const mockSignOut = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockHubListen = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: () => mockFetchAuthSession(),
  signOut: () => mockSignOut(),
  signInWithRedirect: () => mockSignInWithRedirect(),
}));

vi.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (
      channel: string,
      callback: (data: { payload: { event: string } }) => void,
    ) => {
      mockHubListen(channel, callback);
      return () => {};
    },
  },
}));

// Mock the auth config
vi.mock("@/lib/auth", () => ({
  allowedEmailSuffixes: [],
  microsoftProvider: { custom: "Microsoft" },
  getAmplifyConfig: () => ({
    Auth: {
      Cognito: {
        userPoolId: "test-pool",
        userPoolClientId: "test-client",
      },
    },
  }),
  amplifyConfig: {},
}));

// Import App after mocks
import App from "@/App";

// Custom render with ThemeProvider
const renderApp = () => {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
};

describe("App Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initial auth check", () => {
    it("shows loading state while checking session", async () => {
      mockFetchAuthSession.mockImplementation(() => new Promise(() => {}));

      renderApp();

      expect(screen.getByText("Checking your session")).toBeInTheDocument();
    });

    it("shows login page when no session", async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByText(/Sign in with Microsoft/i)).toBeInTheDocument();
    });

    it("shows authenticated content when session exists", async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          idToken: {
            payload: {
              sub: "user-123",
              email: "test@example.com",
              name: "Test User",
            },
          },
        },
      });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Sign out/i)).toBeInTheDocument();
      });
    });
  });

  describe("Hub auth events", () => {
    it("registers hub listener on mount", async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      renderApp();

      await waitFor(() => {
        expect(mockHubListen).toHaveBeenCalledWith(
          "auth",
          expect.any(Function),
        );
      });
    });

    it("refreshes user on signedIn event", async () => {
      let hubCallback: ((data: { payload: { event: string } }) => void) | null =
        null;

      mockHubListen.mockImplementation((_channel, callback) => {
        hubCallback = callback;
        return () => {};
      });

      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      renderApp();

      await waitFor(() => {
        expect(hubCallback).not.toBeNull();
      });

      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          idToken: {
            payload: {
              sub: "user-456",
              email: "newuser@example.com",
            },
          },
        },
      });

      act(() => {
        hubCallback!({ payload: { event: "signedIn" } });
      });

      await waitFor(() => {
        expect(mockFetchAuthSession).toHaveBeenCalledTimes(2);
      });
    });

    it("clears user on signedOut event", async () => {
      let hubCallback: ((data: { payload: { event: string } }) => void) | null =
        null;

      mockHubListen.mockImplementation((_channel, callback) => {
        hubCallback = callback;
        return () => {};
      });

      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          idToken: {
            payload: {
              sub: "user-123",
              email: "test@example.com",
            },
          },
        },
      });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      act(() => {
        hubCallback!({ payload: { event: "signedOut" } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Sign in with Microsoft/i)).toBeInTheDocument();
      });
    });
  });

  describe("Sign out", () => {
    it("calls signOut when sign out button clicked", async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          idToken: {
            payload: {
              sub: "user-123",
              email: "test@example.com",
            },
          },
        },
      });

      mockSignOut.mockResolvedValue(undefined);

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      const signOutButton = await screen.findByText(/Sign out/i);
      await userEvent.click(signOutButton);

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("Login Page", () => {
    it("renders login branding and welcome message", async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByText("Talent Pool")).toBeInTheDocument();
      expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });

    it("triggers sign in when button clicked", async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      const signInButton = screen.getByText(/Sign in with Microsoft/i);
      await userEvent.click(signInButton);

      await waitFor(() => {
        expect(mockSignInWithRedirect).toHaveBeenCalled();
      });
    });

    it("handles existing session on sign in click", async () => {
      // First return no session, then return session
      mockFetchAuthSession
        .mockResolvedValueOnce({ tokens: undefined })
        .mockResolvedValueOnce({
          tokens: {
            idToken: {
              payload: { email: "test@example.com" },
            },
          },
        });

      // Mock window.location.reload
      const reloadMock = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, reload: reloadMock },
        writable: true,
      });

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      const signInButton = screen.getByText(/Sign in with Microsoft/i);
      await userEvent.click(signInButton);

      await waitFor(() => {
        expect(reloadMock).toHaveBeenCalled();
      });

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe("Session error handling", () => {
    it("handles fetchAuthSession errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetchAuthSession.mockRejectedValue(new Error("Session error"));

      renderApp();

      await waitFor(() => {
        // Should show login page on error
        expect(screen.getByText(/Sign in with Microsoft/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it("handles sign out errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          idToken: {
            payload: {
              sub: "user-123",
              email: "test@example.com",
            },
          },
        },
      });

      mockSignOut.mockRejectedValue(new Error("Sign out failed"));

      renderApp();

      await waitFor(() => {
        expect(
          screen.queryByText("Checking your session"),
        ).not.toBeInTheDocument();
      });

      const signOutButton = await screen.findByText(/Sign out/i);
      await userEvent.click(signOutButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Sign-out failed",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
