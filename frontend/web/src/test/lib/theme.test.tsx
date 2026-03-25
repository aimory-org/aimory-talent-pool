/**
 * Tests for ThemeProvider and useTheme hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/lib/theme";

describe("ThemeProvider", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Mock matchMedia
    originalMatchMedia = window.matchMedia;
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false, // Light mode by default
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.matchMedia = mockMatchMedia;

    // Reset document classes
    document.documentElement.classList.remove(
      "light",
      "dark",
      "theme-switching",
    );
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("provides default dark theme", () => {
    const TestComponent = () => {
      const { theme, resolvedTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <span data-testid="resolved">{resolvedTheme}</span>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("loads theme from localStorage", () => {
    localStorage.setItem("theme", "light");

    const TestComponent = () => {
      const { theme, resolvedTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <span data-testid="resolved">{resolvedTheme}</span>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("allows changing theme", async () => {
    const TestComponent = () => {
      const { theme, setTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button onClick={() => setTheme("light")}>Set Light</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: /set light/i }));

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("applies theme class to document", async () => {
    const TestComponent = () => {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("light")}>Set Light</button>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Should have dark class initially
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await userEvent.click(screen.getByRole("button"));

    // Should have light class after change
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves system theme based on prefers-color-scheme", () => {
    localStorage.setItem("theme", "system");
    mockMatchMedia.mockReturnValue({
      matches: true, // Dark mode
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const TestComponent = () => {
      const { theme, resolvedTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <span data-testid="resolved">{resolvedTheme}</span>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("resolves system theme to light when prefers light", () => {
    localStorage.setItem("theme", "system");
    mockMatchMedia.mockReturnValue({
      matches: false, // Light mode
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const TestComponent = () => {
      const { resolvedTheme } = useTheme();
      return <span data-testid="resolved">{resolvedTheme}</span>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("listens for system theme changes when system theme selected", async () => {
    localStorage.setItem("theme", "system");
    const addEventListenerMock = vi.fn();
    const removeEventListenerMock = vi.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    });

    const TestComponent = () => {
      const { resolvedTheme } = useTheme();
      return <span data-testid="resolved">{resolvedTheme}</span>;
    };

    const { unmount } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Should have added listener for system theme
    expect(addEventListenerMock).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    unmount();

    // Should clean up listener on unmount
    expect(removeEventListenerMock).toHaveBeenCalled();
  });

  it("cycles through themes", async () => {
    const TestComponent = () => {
      const { theme, setTheme } = useTheme();
      const cycleTheme = () => {
        if (theme === "dark") setTheme("light");
        else if (theme === "light") setTheme("system");
        else setTheme("dark");
      };
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button onClick={cycleTheme}>Cycle</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("theme").textContent).toBe("light");

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("theme").textContent).toBe("system");

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });
});

describe("useTheme hook", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
  });

  it("throws when used outside ThemeProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within a ThemeProvider");

    consoleSpy.mockRestore();
  });

  it("provides theme context when inside provider", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(typeof result.current.setTheme).toBe("function");
  });

  it("updates theme when setTheme is called", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });
});
