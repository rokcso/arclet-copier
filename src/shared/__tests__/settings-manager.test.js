import { describe, it, expect, beforeEach, vi } from "vitest";
import { SettingsManager } from "../settings-manager.js";

describe("SettingsManager", () => {
  let settingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    settingsManager = new SettingsManager();
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      expect(settingsManager.cache).toBeInstanceOf(Map);
      expect(settingsManager.cacheTimeout).toBe(5 * 60 * 1000);
      expect(settingsManager.changeListeners).toBeInstanceOf(Set);
    });

    it("should set up storage listener", () => {
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
    });
  });

  describe("detectDefaultLanguage", () => {
    it("should detect Chinese Simplified correctly", () => {
      chrome.i18n.getUILanguage.mockReturnValue("zh-CN");
      const manager = new SettingsManager();
      expect(manager.defaults.language).toBe("zh_CN");
    });

    it("should detect Chinese Traditional correctly", () => {
      chrome.i18n.getUILanguage.mockReturnValue("zh-TW");
      const manager = new SettingsManager();
      expect(manager.defaults.language).toBe("zh_TW");
    });

    it("should detect Spanish correctly", () => {
      chrome.i18n.getUILanguage.mockReturnValue("es-ES");
      const manager = new SettingsManager();
      expect(manager.defaults.language).toBe("es");
    });

    it("should default to English for unknown languages", () => {
      chrome.i18n.getUILanguage.mockReturnValue("xx-XX");
      const manager = new SettingsManager();
      expect(manager.defaults.language).toBe("en");
    });
  });

  describe("isCacheValid", () => {
    it("should return true when cache is fresh", () => {
      settingsManager.lastCacheTime = Date.now() - 1000; // 1 second ago
      expect(settingsManager.isCacheValid()).toBe(true);
    });

    it("should return false when cache is stale", () => {
      settingsManager.lastCacheTime = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      expect(settingsManager.isCacheValid()).toBe(false);
    });
  });

  describe("getAllSettings", () => {
    it("should return cached settings when cache is valid", async () => {
      const cachedSettings = { urlCleaning: "smart", language: "en" };
      settingsManager.cache.set("urlCleaning", "smart");
      settingsManager.cache.set("language", "en");
      settingsManager.lastCacheTime = Date.now();

      const result = await settingsManager.getAllSettings();
      expect(result).toEqual(cachedSettings);
      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    });

    it("should fetch from storage when cache is invalid", async () => {
      chrome.storage.sync.get.mockResolvedValue({ urlCleaning: "off" });

      const result = await settingsManager.getAllSettings();

      expect(chrome.storage.sync.get).toHaveBeenCalled();
      expect(result.urlCleaning).toBe("off");
      expect(result.language).toBeDefined(); // Should have default value
    });

    it("should handle backward compatibility for removeParams", async () => {
      chrome.storage.sync.get.mockResolvedValue({ removeParams: true });

      const result = await settingsManager.getAllSettings();

      expect(result.urlCleaning).toBe("smart");
    });

    it("should handle backward compatibility for chromeNotifications", async () => {
      chrome.storage.sync.get.mockResolvedValue({ chromeNotifications: true });

      const result = await settingsManager.getAllSettings();

      expect(result.notificationType).toBe("chrome");
    });

    it("should return defaults when storage fails", async () => {
      chrome.storage.sync.get.mockRejectedValue(new Error("Storage error"));

      const result = await settingsManager.getAllSettings();

      expect(result).toEqual(settingsManager.defaults);
    });
  });

  describe("getSetting", () => {
    it("should return specific setting", async () => {
      chrome.storage.sync.get.mockResolvedValue({ urlCleaning: "smart" });

      const result = await settingsManager.getSetting("urlCleaning");

      expect(result).toBe("smart");
    });

    it("should return default value when setting not found", async () => {
      chrome.storage.sync.get.mockResolvedValue({});

      const result = await settingsManager.getSetting("urlCleaning");

      expect(result).toBe("smart"); // Default value
    });
  });

  describe("updateSettings", () => {
    it("should update settings and cache", async () => {
      const updates = { urlCleaning: "off", language: "zh_CN" };
      chrome.storage.sync.set.mockResolvedValue(undefined);

      const result = await settingsManager.updateSettings(updates);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(updates);
      expect(result).toBe(true);
      expect(settingsManager.cache.get("urlCleaning")).toBe("off");
      expect(settingsManager.cache.get("language")).toBe("zh_CN");
    });

    it("should return false when update fails", async () => {
      chrome.storage.sync.set.mockRejectedValue(new Error("Update failed"));

      const result = await settingsManager.updateSettings({
        urlCleaning: "off",
      });

      expect(result).toBe(false);
    });

    it("should invalidate short URL cache when urlCleaning changes", async () => {
      // Setup cache with existing urlCleaning
      settingsManager.cache.set("urlCleaning", "smart");

      chrome.storage.sync.set.mockResolvedValue(undefined);

      const result = await settingsManager.updateSettings({
        urlCleaning: "off",
      });

      expect(result).toBe(true);
      expect(settingsManager.cache.get("urlCleaning")).toBe("off");
    });
  });

  describe("updateSetting", () => {
    it("should update single setting", async () => {
      chrome.storage.sync.set.mockResolvedValue(undefined);

      const result = await settingsManager.updateSetting("urlCleaning", "off");

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        urlCleaning: "off",
      });
      expect(result).toBe(true);
      expect(settingsManager.cache.get("urlCleaning")).toBe("off");
    });
  });

  describe("clearCache", () => {
    it("should clear cache and reset time", () => {
      settingsManager.cache.set("test", "value");
      settingsManager.lastCacheTime = Date.now();

      settingsManager.clearCache();

      expect(settingsManager.cache.size).toBe(0);
      expect(settingsManager.lastCacheTime).toBe(0);
    });
  });

  describe("getSettings", () => {
    it("should return subset of settings", async () => {
      chrome.storage.sync.get.mockResolvedValue({
        urlCleaning: "smart",
        language: "en",
        themeColor: "blue",
      });

      const result = await settingsManager.getSettings([
        "urlCleaning",
        "language",
      ]);

      expect(result).toEqual({
        urlCleaning: "smart",
        language: "en",
      });
    });
  });

  describe("change listeners", () => {
    it("should add and remove change listeners", () => {
      const listener = vi.fn();
      const unsubscribe = settingsManager.addChangeListener(listener);

      expect(settingsManager.changeListeners.has(listener)).toBe(true);

      unsubscribe();

      expect(settingsManager.changeListeners.has(listener)).toBe(false);
    });

    it("should notify listeners on storage changes", () => {
      const listener = vi.fn();
      settingsManager.addChangeListener(listener);

      // Ensure the listener was set up
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();

      const changes = { urlCleaning: { newValue: "off" } };
      const mockCallback =
        chrome.storage.onChanged.addListener.mock.calls[0][0];

      mockCallback(changes, "sync");

      expect(listener).toHaveBeenCalledWith(changes);
    });

    it("should not notify listeners for non-sync storage changes", () => {
      const listener = vi.fn();
      settingsManager.addChangeListener(listener);

      const changes = { urlCleaning: { newValue: "off" } };
      const mockCallback =
        chrome.storage.onChanged.addListener.mock.calls[0][0];

      mockCallback(changes, "local");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener errors gracefully", () => {
      const listener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });
      settingsManager.addChangeListener(listener);

      const changes = { urlCleaning: { newValue: "off" } };
      const mockCallback =
        chrome.storage.onChanged.addListener.mock.calls[0][0];

      expect(() => mockCallback(changes, "sync")).not.toThrow();
    });
  });
});
