import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PARAM_CATEGORIES,
  processUrl,
  isRestrictedPage,
  isValidWebUrl,
  SHORT_URL_SERVICES,
  createShortUrlDirect,
  createShortUrl,
  ShortUrlThrottle,
  globalShortUrlThrottle,
  TEMPLATE_FIELDS,
  TemplateEngine,
  generateTemplateId,
  createTemplate,
  TemplateChangeNotifier,
} from "../constants.js";

// Mock Chrome APIs before imports
vi.mock("../constants.js", async () => {
  // Import the actual functions we need to test
  const module = await import("../constants.js");
  return {
    ...module,
    // Keep the functions that don't depend on Chrome APIs
    getCustomParamRules: vi.fn(),
    saveCustomParamRules: vi.fn(),
    initializeParamRules: vi.fn(),
    getCustomTemplates: vi.fn(),
    saveCustomTemplates: vi.fn(),
    getAllTemplates: vi.fn(),
    loadTemplatesIntoSelect: vi.fn(),
    validateAndFixSelector: vi.fn(),
  };
});

// Mock the functions that depend on Chrome APIs
vi.mock("../constants.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    getCustomParamRules: vi.fn(),
    saveCustomParamRules: vi.fn(),
    initializeParamRules: vi.fn(),
    getCustomTemplates: vi.fn(),
    saveCustomTemplates: vi.fn(),
    getAllTemplates: vi.fn(),
  };
});

describe("constants.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.sync.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue(undefined);
  });

  describe("PARAM_CATEGORIES", () => {
    it("should have tracking parameters", () => {
      expect(PARAM_CATEGORIES.TRACKING).toContain("utm_source");
      expect(PARAM_CATEGORIES.TRACKING).toContain("fbclid");
      expect(PARAM_CATEGORIES.TRACKING).toContain("gclid");
    });

    it("should have functional parameters", () => {
      expect(PARAM_CATEGORIES.FUNCTIONAL).toContain("page");
      expect(PARAM_CATEGORIES.FUNCTIONAL).toContain("q");
      expect(PARAM_CATEGORIES.FUNCTIONAL).toContain("sort");
    });
  });

  describe("processUrl", () => {
    it("should return original URL when cleaning mode is off", async () => {
      const url = "https://example.com?utm_source=test";
      const result = await processUrl(url, "off");

      expect(result).toBe(url);
    });

    it("should remove all parameters in aggressive mode", async () => {
      const url = "https://example.com/path?utm_source=test&page=1";
      const result = await processUrl(url, "aggressive");

      expect(result).toBe("https://example.com/path");
    });

    it("should return original URL on error", async () => {
      const url = "not-a-valid-url";
      const result = await processUrl(url, "smart");

      expect(result).toBe(url);
    });
  });

  describe("isRestrictedPage", () => {
    it("should return true for restricted protocols", () => {
      expect(isRestrictedPage("chrome://settings")).toBe(true);
      expect(isRestrictedPage("chrome-extension://id/page")).toBe(true);
      expect(isRestrictedPage("about:blank")).toBe(true);
    });

    it("should return true for restricted domains", () => {
      expect(
        isRestrictedPage("https://chromewebstore.google.com/extension"),
      ).toBe(true);
      expect(isRestrictedPage("https://chrome.google.com/webstore")).toBe(true);
    });

    it("should return false for normal websites", () => {
      expect(isRestrictedPage("https://example.com")).toBe(false);
      expect(isRestrictedPage("https://www.github.com")).toBe(false);
    });

    it("should return true for invalid URLs", () => {
      expect(isRestrictedPage("")).toBe(true);
      expect(isRestrictedPage("not-a-url")).toBe(true);
    });
  });

  describe("isValidWebUrl", () => {
    it("should return true for valid HTTP URLs", () => {
      expect(isValidWebUrl("http://example.com")).toBe(true);
      expect(isValidWebUrl("https://www.example.com/path")).toBe(true);
    });

    it("should return false for non-HTTP protocols", () => {
      expect(isValidWebUrl("ftp://example.com")).toBe(false);
      expect(isValidWebUrl("file:///path/to/file")).toBe(false);
      expect(isValidWebUrl("javascript:void(0)")).toBe(false);
    });

    it("should return false for local addresses", () => {
      expect(isValidWebUrl("http://localhost")).toBe(false);
      expect(isValidWebUrl("http://127.0.0.1")).toBe(false);
      expect(isValidWebUrl("http://192.168.1.1")).toBe(false);
      expect(isValidWebUrl("http://10.0.0.1")).toBe(false);
      expect(isValidWebUrl("http://test.local")).toBe(false);
    });

    it("should return false for invalid inputs", () => {
      expect(isValidWebUrl("")).toBe(false);
      expect(isValidWebUrl(null)).toBe(false);
      expect(isValidWebUrl("not-a-url")).toBe(false);
    });
  });

  describe("SHORT_URL_SERVICES", () => {
    it("should have is.gd service config", () => {
      expect(SHORT_URL_SERVICES.isgd).toEqual({
        name: "is.gd",
        endpoint: "https://is.gd/create.php",
        method: "GET",
        params: expect.any(Function),
      });
    });

    it("should have TinyURL service config", () => {
      expect(SHORT_URL_SERVICES.tinyurl).toEqual({
        name: "TinyURL",
        endpoint: "https://tinyurl.com/api-create.php",
        method: "GET",
        params: expect.any(Function),
      });
    });

    it("should generate correct params for is.gd", () => {
      const params = SHORT_URL_SERVICES.isgd.params("https://example.com");
      expect(params).toEqual({ format: "simple", url: "https://example.com" });
    });

    it("should generate correct params for TinyURL", () => {
      const params = SHORT_URL_SERVICES.tinyurl.params("https://example.com");
      expect(params).toEqual({ url: "https://example.com" });
    });
  });

  describe("ShortUrlThrottle", () => {
    let throttle;

    beforeEach(() => {
      throttle = new ShortUrlThrottle();
    });

    it("should initialize with correct defaults", () => {
      expect(throttle.concurrentLimit).toBe(3);
      expect(throttle.requestDelay).toBe(200);
      expect(throttle.requestQueue).toEqual([]);
      expect(throttle.activeRequests).toBe(0);
    });

    it("should execute requests with throttling", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");

      const promise = throttle.throttledRequest(requestFn);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(requestFn).toHaveBeenCalled();
      expect(await promise).toBe("result");
    });

    it("should queue requests properly", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");

      const promise1 = throttle.throttledRequest(requestFn);
      const promise2 = throttle.throttledRequest(requestFn);

      // Both promises should resolve
      const results = await Promise.all([promise1, promise2]);
      expect(results).toEqual(["result", "result"]);
    });

    it("should handle progress callbacks", async () => {
      const progressCallback = vi.fn();
      throttle.setProgressCallback(progressCallback);

      const requestFn = vi.fn().mockResolvedValue("result");
      await throttle.throttledRequest(requestFn);

      expect(progressCallback).toHaveBeenCalled();
    });

    it("should provide status information", () => {
      const status = throttle.getStatus();

      expect(status).toEqual({
        activeRequests: 0,
        queueLength: 0,
        isProcessing: false,
      });
    });
  });

  describe("createShortUrlDirect", () => {
    it("should create short URL successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("https://is.gd/abc123"),
      });

      const result = await createShortUrlDirect("https://example.com", "isgd");

      expect(result).toBe("https://is.gd/abc123");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("is.gd/create.php"),
        expect.objectContaining({
          method: "GET",
          headers: { "User-Agent": "Arclet Copier Chrome Extension" },
        }),
      );
    });

    it("should throw error for unknown service", async () => {
      await expect(
        createShortUrlDirect("https://example.com", "unknown"),
      ).rejects.toThrow("Unknown short URL service: unknown");
    });

    it("should handle HTTP errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        createShortUrlDirect("https://example.com", "isgd"),
      ).rejects.toThrow("HTTP 500: Internal Server Error");
    });

    it("should handle invalid response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("Error: Invalid URL"),
      });

      await expect(
        createShortUrlDirect("https://example.com", "isgd"),
      ).rejects.toThrow("Invalid short URL returned: Error: Invalid URL");
    });
  });

  describe("createShortUrl", () => {
    it("should use global throttle", async () => {
      const throttledRequestSpy = vi.spyOn(
        globalShortUrlThrottle,
        "throttledRequest",
      );
      throttledRequestSpy.mockResolvedValue("https://is.gd/abc123");

      const result = await createShortUrl("https://example.com", "isgd");

      expect(result).toBe("https://is.gd/abc123");
      expect(throttledRequestSpy).toHaveBeenCalledWith(expect.any(Function));

      throttledRequestSpy.mockRestore();
    });
  });

  describe("TEMPLATE_FIELDS", () => {
    it("should have basic fields", () => {
      expect(TEMPLATE_FIELDS.url).toBeDefined();
      expect(TEMPLATE_FIELDS.title).toBeDefined();
      expect(TEMPLATE_FIELDS.hostname).toBeDefined();
    });

    it("should have time fields", () => {
      expect(TEMPLATE_FIELDS.date).toBeDefined();
      expect(TEMPLATE_FIELDS.time).toBeDefined();
      expect(TEMPLATE_FIELDS.timestamp).toBeDefined();
    });

    it("should have proper field structure", () => {
      const field = TEMPLATE_FIELDS.url;
      expect(field).toHaveProperty("name");
      expect(field).toHaveProperty("description");
      expect(field).toHaveProperty("example");
      expect(field).toHaveProperty("category");
    });
  });

  describe("TemplateEngine", () => {
    let engine;

    beforeEach(() => {
      engine = new TemplateEngine();
    });

    describe("processTemplate", () => {
      it("should replace basic fields", async () => {
        const template = "Visit {{url}} for more info";
        const context = { url: "https://example.com" };

        const result = await engine.processTemplate(template, context);

        expect(result).toBe("Visit https://example.com/ for more info");
      });

      it("should handle multiple fields", async () => {
        const template = "{{title}} - {{url}}";
        const context = {
          title: "Example Page",
          url: "https://example.com",
        };

        const result = await engine.processTemplate(template, context);

        expect(result).toBe("Example Page - https://example.com/");
      });

      it("should handle time fields dynamically", async () => {
        const template = "Generated on {{date}}";

        const result = await engine.processTemplate(template, {});

        expect(result).toMatch(/^Generated on \d{4}-\d{2}-\d{2}$/);
      });

      it("should return empty string for empty template", async () => {
        const result = await engine.processTemplate("", {});
        expect(result).toBe("");
      });

      it("should handle missing context gracefully", async () => {
        const template = "Test {{url}}";

        const result = await engine.processTemplate(template, null);

        expect(result).toBe("Test undefined");
      });

      it("should handle field processing errors", async () => {
        const template = "Test {{url}}";
        const context = { url: "invalid-url" };

        // Mock a field processor to throw an error
        const originalProcessor = engine.fieldProcessors.get("url");
        engine.fieldProcessors.set(
          "url",
          vi.fn().mockRejectedValue(new Error("Processing error")),
        );

        const result = await engine.processTemplate(template, context);

        // Should keep original placeholder on error
        expect(result).toBe("Test {{url}}");

        // Restore original processor
        engine.fieldProcessors.set("url", originalProcessor);
      });
    });

    describe("validateTemplate", () => {
      it("should validate correct template", () => {
        const template = "{{url}} and {{title}}";

        const result = engine.validateTemplate(template);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.fields).toContain("url");
        expect(result.fields).toContain("title");
      });

      it("should detect empty template", () => {
        const result = engine.validateTemplate("");

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Template is empty");
      });

      it("should detect invalid field names", () => {
        const template = "{{}} and {{invalid-name}}";

        const result = engine.validateTemplate(template);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("should handle non-string template", () => {
        const result = engine.validateTemplate(123);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Template must be a string");
      });
    });

    describe("getTemplateFields", () => {
      it("should extract field names", () => {
        const template = "{{url}} and {{title}} and {{url}}";

        const fields = engine.getTemplateFields(template);

        expect(fields).toContain("url");
        expect(fields).toContain("title");
        expect(fields).toHaveLength(2); // Should deduplicate
      });
    });
  });

  describe("generateTemplateId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateTemplateId();
      const id2 = generateTemplateId();

      expect(id1).toMatch(/^custom_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^custom_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("createTemplate", () => {
    it("should create template with correct structure", () => {
      const template = createTemplate("Test Template", "{{url}}", "🔗");

      expect(template).toMatchObject({
        name: "Test Template",
        template: "{{url}}",
        icon: "🔗",
        isPreset: false,
        description: "",
      });
      expect(template.id).toMatch(/^custom_\d+_[a-z0-9]+$/);
      expect(template.createdAt).toBeDefined();
    });
  });

  describe("TemplateChangeNotifier", () => {
    it("should send change notification", async () => {
      await TemplateChangeNotifier.notify("created", "template-id");

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "TEMPLATE_CHANGED",
        changeType: "created",
        templateId: "template-id",
        timestamp: expect.any(Number),
      });
    });

    it("should handle messaging errors gracefully", async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error("No connection"));

      // Should not throw
      await expect(
        TemplateChangeNotifier.notify("created"),
      ).resolves.toBeUndefined();
    });
  });
});
