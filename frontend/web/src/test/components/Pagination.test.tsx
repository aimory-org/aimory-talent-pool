import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "@/components/ui/pagination";

describe("Pagination", () => {
  describe("visibility", () => {
    it("renders nothing when totalPages is 1", () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when totalPages is 0", () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={0} onPageChange={vi.fn()} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders when totalPages > 1", () => {
      render(
        <Pagination currentPage={1} totalPages={3} onPageChange={vi.fn()} />,
      );
      expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    });
  });

  describe("prev / next buttons", () => {
    it("disables Previous on the first page", () => {
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
      );
      expect(screen.getByLabelText("Previous page")).toBeDisabled();
    });

    it("disables Next on the last page", () => {
      render(
        <Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />,
      );
      expect(screen.getByLabelText("Next page")).toBeDisabled();
    });

    it("calls onPageChange(2) when Next is clicked from page 1", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByLabelText("Next page"));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it("calls onPageChange(2) when Previous is clicked from page 3", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByLabelText("Previous page"));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it("clamps Previous to 1 even if currentPage is somehow 0", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={0} totalPages={5} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByLabelText("Previous page"));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("clamps Next to totalPages even if currentPage exceeds it", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={6} totalPages={5} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByLabelText("Next page"));
      expect(onPageChange).toHaveBeenCalledWith(5);
    });
  });

  describe("page buttons", () => {
    it("renders all page buttons for small page counts (≤7)", () => {
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
      );
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByLabelText(`Page ${i}`)).toBeInTheDocument();
      }
    });

    it("marks current page button with aria-current='page'", () => {
      render(
        <Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />,
      );
      expect(screen.getByLabelText("Page 3")).toHaveAttribute("aria-current", "page");
      expect(screen.getByLabelText("Page 1")).not.toHaveAttribute("aria-current");
    });

    it("calls onPageChange with the correct page when a page button is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByLabelText("Page 4"));
      expect(onPageChange).toHaveBeenCalledWith(4);
    });
  });

  describe("ellipsis / windowing (totalPages > 7)", () => {
    it("shows leading pages and ellipsis when currentPage is near the start", () => {
      render(
        <Pagination currentPage={2} totalPages={20} onPageChange={vi.fn()} />,
      );
      // Expect pages 1–5, ellipsis, and last page
      expect(screen.getByLabelText("Page 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Page 5")).toBeInTheDocument();
      expect(screen.getByLabelText(`Page 20`)).toBeInTheDocument();
      expect(screen.getByText("…")).toBeInTheDocument();
    });

    it("shows trailing pages and ellipsis when currentPage is near the end", () => {
      render(
        <Pagination currentPage={19} totalPages={20} onPageChange={vi.fn()} />,
      );
      expect(screen.getByLabelText("Page 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Page 16")).toBeInTheDocument();
      expect(screen.getByLabelText("Page 20")).toBeInTheDocument();
    });

    it("shows two ellipses when currentPage is in the middle", () => {
      render(
        <Pagination currentPage={10} totalPages={20} onPageChange={vi.fn()} />,
      );
      const ellipses = screen.getAllByText("…");
      expect(ellipses).toHaveLength(2);
      expect(screen.getByLabelText("Page 9")).toBeInTheDocument();
      expect(screen.getByLabelText("Page 10")).toBeInTheDocument();
      expect(screen.getByLabelText("Page 11")).toBeInTheDocument();
    });
  });
});
