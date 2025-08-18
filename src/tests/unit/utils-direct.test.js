import { describe, it, expect, vi } from "vitest";

describe("Utility Functions (Direct Implementation)", () => {
  describe("truncateText", () => {
    function truncateText(text, maxLength, suffix = "…") {
      if (!text) return "";
      if (text.length <= maxLength) return text;
      return text.slice(0, maxLength - suffix.length) + suffix;
    }

    it("should not truncate text shorter than limit", () => {
      expect(truncateText("Short text", 20)).toBe("Short text");
    });

    it("should truncate text longer than limit", () => {
      expect(
        truncateText("This is a very long text that should be truncated", 20),
      ).toBe("This is a very long…");
    });

    it("should handle empty string", () => {
      expect(truncateText("", 10)).toBe("");
    });

    it("should handle null/undefined input", () => {
      expect(truncateText(null, 10)).toBe("");
      expect(truncateText(undefined, 10)).toBe("");
    });

    it("should use custom suffix", () => {
      expect(truncateText("Long text here", 10, "...")).toBe("Long te...");
    });
  });

  describe("formatDate", () => {
    function formatDate(dateInput) {
      if (!dateInput) return "Invalid Date";

      try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return "Invalid Date";

        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch (error) {
        return "Invalid Date";
      }
    }

    it("should format valid date string", () => {
      const date = "2024-01-15T12:00:00Z";
      const formatted = formatDate(date);
      expect(formatted).toBe("Jan 15, 2024");
    });

    it("should format Date object", () => {
      const date = new Date("2024-01-15T12:00:00Z");
      const formatted = formatDate(date);
      expect(formatted).toBe("Jan 15, 2024");
    });

    it("should handle invalid date", () => {
      expect(formatDate("invalid-date")).toBe("Invalid Date");
    });

    it("should handle null/undefined", () => {
      expect(formatDate(null)).toBe("Invalid Date");
      expect(formatDate(undefined)).toBe("Invalid Date");
    });
  });

  describe("safeAsync", () => {
    async function safeAsync(fn, options = {}) {
      const { timeout, fallback, errorContext } = options;

      try {
        let promise = fn();

        if (timeout) {
          promise = Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(new Error(`Operation timed out after ${timeout}ms`)),
                timeout,
              ),
            ),
          ]);
        }

        return await promise;
      } catch (error) {
        if (errorContext && process.env.NODE_ENV === "development") {
          console.error(`${errorContext} failed:`, error);
        }
        return fallback;
      }
    }

    it("should return successful result", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");
      const result = await safeAsync(mockFn, { fallback: "fallback" });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalled();
    });

    it("should return fallback on error", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Test error"));
      const result = await safeAsync(mockFn, { fallback: "fallback" });

      expect(result).toBe("fallback");
    });

    it("should respect timeout", async () => {
      const mockFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("slow"), 200);
          }),
      );

      const result = await safeAsync(mockFn, {
        timeout: 50,
        fallback: "timeout",
      });

      expect(result).toBe("timeout");
    });
  });

  describe("withTimeout", () => {
    function withTimeout(promise, timeoutMs, message = "Operation timed out") {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message)), timeoutMs),
      );

      return Promise.race([promise, timeoutPromise]);
    }

    it("should resolve within timeout", async () => {
      const promise = Promise.resolve("success");
      const result = await withTimeout(promise, 1000);

      expect(result).toBe("success");
    });

    it("should timeout for slow operations", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("slow"), 200);
      });

      await expect(
        withTimeout(slowPromise, 50, "Operation timed out"),
      ).rejects.toThrow("Operation timed out");
    });

    it("should use default timeout message", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("slow"), 200);
      });

      await expect(withTimeout(slowPromise, 50)).rejects.toThrow(
        "Operation timed out",
      );
    });
  });
});
