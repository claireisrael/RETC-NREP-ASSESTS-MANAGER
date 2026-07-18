"use client";

import { Button } from "./button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Slice a list for client-side pagination.
 */
export function paginateItems(items = [], page = 1, pageSize = 12) {
  const list = Array.isArray(items) ? items : [];
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  return {
    items: pageItems,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, totalItems),
  };
}

function buildPageWindow(current, total, windowSize = 5) {
  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, current - half);
  let end = start + windowSize - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - windowSize + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Shared list pagination control (Prev / numbered pages / Next).
 */
export function ListPagination({
  page = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 12,
  onPageChange,
  className = "",
  itemLabel = "items",
}) {
  if (!onPageChange || totalPages <= 1) return null;

  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalItems);
  const pages = buildPageWindow(page, totalPages, 5);

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 ${className}`}
    >
      <p className="text-sm text-gray-600">
        Showing{" "}
        <span className="font-medium text-gray-900">
          {startIndex}–{endIndex}
        </span>{" "}
        of <span className="font-medium text-gray-900">{totalItems}</span>{" "}
        {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>

        {pages[0] > 1 ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              className="min-w-9"
            >
              1
            </Button>
            {pages[0] > 2 ? (
              <span className="px-1 text-gray-400 text-sm">…</span>
            ) : null}
          </>
        ) : null}

        {pages.map((n) => (
          <Button
            key={n}
            type="button"
            variant={n === page ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(n)}
            className={`min-w-9 ${
              n === page
                ? "!bg-[var(--org-primary)] !border-[var(--org-primary)] !text-white"
                : ""
            }`}
          >
            {n}
          </Button>
        ))}

        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? (
              <span className="px-1 text-gray-400 text-sm">…</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              className="min-w-9"
            >
              {totalPages}
            </Button>
          </>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
