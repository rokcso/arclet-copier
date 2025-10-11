import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedShortUrl,
  setCachedShortUrl,
  getOrGenerateShortUrl,
} from "../cache-helper.js";

// Mock dependencies
vi.mock("../constants.js", () => ({
  processUrl: vi.fn(),
  isValidWebUrl: vi.fn(),
  createShortUrl: vi.fn(),
}));

import { processUrl, isValidWebUrl, createShortUrl } from "../constants.js";

describe("cache-helper", () => {
  let mockCache;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Reset mock implementations
    processUrl.mockResolvedValue("https://example.com/cleaned");
    isValidWebUrl.mockReturnValue(true);
    createShortUrl.mockResolvedValue("https://short.ly/abc123");
  });

  describe("getCachedShortUrl", () => {
    it("should return cached short URL when found", async () => {
      mockCache.get.mockResolvedValue("https://short.ly/abc123");

      const result = await getCachedShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(processUrl).toHaveBeenCalledWith(
        "https://example.com/original",
        "smart",
      );
      expect(mockCache.get).toHaveBeenCalledWith(
        "https://example.com/cleaned",
        "isgd",
      );
      expect(result).toBe("https://short.ly/abc123");
    });

    it("should return null when cache miss", async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await getCachedShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBeNull();
    });

    it("should return null for invalid parameters", async () => {
      const result1 = await getCachedShortUrl(null, "url", "smart", "isgd");
      const result2 = await getCachedShortUrl(mockCache, null, "smart", "isgd");
      const result3 = await getCachedShortUrl(mockCache, "url", null, "isgd");
      const result4 = await getCachedShortUrl(mockCache, "url", "smart", null);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
      expect(result4).toBeNull();
    });

    it("should handle cache errors gracefully", async () => {
      mockCache.get.mockRejectedValue(new Error("Cache error"));

      const result = await getCachedShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBeNull();
      expect(console.debug).toHaveBeenCalledWith(
        "[CacheHelper] Failed to get cached short URL:",
        expect.any(Error),
      );
    });
  });

  describe("setCachedShortUrl", () => {
    it("should save short URL to cache", async () => {
      mockCache.set.mockResolvedValue(true);

      const result = await setCachedShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
        "https://short.ly/abc123",
      );

      expect(processUrl).toHaveBeenCalledWith(
        "https://example.com/original",
        "smart",
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        "https://example.com/cleaned",
        "isgd",
        "https://short.ly/abc123",
      );
      expect(result).toBe(true);
    });

    it("should return false for invalid parameters", async () => {
      const result1 = await setCachedShortUrl(
        null,
        "url",
        "smart",
        "isgd",
        "short",
      );
      const result2 = await setCachedShortUrl(
        mockCache,
        null,
        "smart",
        "isgd",
        "short",
      );
      const result3 = await setCachedShortUrl(
        mockCache,
        "url",
        null,
        "isgd",
        "short",
      );
      const result4 = await setCachedShortUrl(
        mockCache,
        "url",
        "smart",
        null,
        "short",
      );
      const result5 = await setCachedShortUrl(
        mockCache,
        "url",
        "smart",
        "isgd",
        null,
      );

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(result4).toBe(false);
      expect(result5).toBe(false);
    });

    it("should handle cache errors gracefully", async () => {
      mockCache.set.mockRejectedValue(new Error("Cache error"));

      const result = await setCachedShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
        "https://short.ly/abc123",
      );

      expect(result).toBe(false);
      expect(console.debug).toHaveBeenCalledWith(
        "[CacheHelper] Failed to set cached short URL:",
        expect.any(Error),
      );
    });
  });

  describe("getOrGenerateShortUrl", () => {
    it("should return cached URL when available", async () => {
      mockCache.get.mockResolvedValue("https://short.ly/cached");
      mockCache.set.mockResolvedValue(true);

      const result = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBe("https://short.ly/cached");
      expect(createShortUrl).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it("should generate new short URL when cache miss", async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(true);
      createShortUrl.mockResolvedValue("https://short.ly/new");

      const result = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(createShortUrl).toHaveBeenCalledWith(
        "https://example.com/original",
        "isgd",
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        "https://example.com/cleaned",
        "isgd",
        "https://short.ly/new",
      );
      expect(result).toBe("https://short.ly/new");
    });

    it("should return cleaned URL for invalid parameters", async () => {
      const result1 = await getOrGenerateShortUrl(
        null,
        "https://example.com",
        "smart",
        "isgd",
      );
      const result2 = await getOrGenerateShortUrl(
        mockCache,
        null,
        "smart",
        "isgd",
      );
      const result3 = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com",
        null,
        "isgd",
      );
      const result4 = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com",
        "smart",
        null,
      );

      // Should return cleaned URL instead of throwing
      expect(result1).toBe("https://example.com/cleaned");
      expect(result2).toBe("https://example.com/cleaned");
      expect(result3).toBe("https://example.com/cleaned");
      expect(result4).toBe("https://example.com/cleaned");
    });

    it("should return cleaned URL for invalid URLs", async () => {
      isValidWebUrl.mockReturnValue(false);

      const result = await getOrGenerateShortUrl(
        mockCache,
        "invalid-url",
        "smart",
        "isgd",
      );

      // Should return cleaned URL instead of throwing
      expect(result).toBe("https://example.com/cleaned");
    });

    it("should fallback to cleaned URL when short URL generation fails", async () => {
      mockCache.get.mockResolvedValue(null);
      createShortUrl.mockRejectedValue(new Error("Service error"));

      const result = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBe("https://example.com/cleaned");
      expect(console.log).toHaveBeenCalledWith(
        "[CacheHelper] Falling back to cleaned URL:",
        "https://example.com/cleaned",
      );
    });

    it("should fallback to original URL when both short URL and cleaning fail", async () => {
      mockCache.get.mockResolvedValue(null);
      createShortUrl.mockRejectedValue(new Error("Service error"));
      processUrl.mockRejectedValue(new Error("Cleaning error"));

      const result = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBe("https://example.com/original");
      expect(console.debug).toHaveBeenCalledWith(
        "[CacheHelper] Fallback also failed:",
        expect.any(Error),
      );
    });

    it("should handle cache set failure gracefully", async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error("Cache set error"));
      createShortUrl.mockResolvedValue("https://short.ly/new");

      const result = await getOrGenerateShortUrl(
        mockCache,
        "https://example.com/original",
        "smart",
        "isgd",
      );

      expect(result).toBe("https://short.ly/new");
    });
  });
});
