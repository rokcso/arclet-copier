// Settings Manager - 统一的设置管理工具
// 提供批量storage操作和缓存功能

class SettingsManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    this.lastCacheTime = 0;

    // 默认设置值
    this.defaults = {
      urlCleaning: 'off',
      silentCopyFormat: 'url',
      appearance: 'system',
      language: this.detectDefaultLanguage(),
      themeColor: 'green',
      chromeNotifications: true,
      shortUrlService: 'isgd',
      removeParams: false // 向后兼容
    };
  }

  // 检测默认语言
  detectDefaultLanguage() {
    const browserLang = chrome.i18n.getUILanguage();
    if (browserLang.startsWith("zh")) {
      if (
        browserLang === "zh-TW" ||
        browserLang === "zh-HK" ||
        browserLang === "zh-MO"
      ) {
        return "zh_TW";
      } else {
        return "zh_CN";
      }
    } else if (browserLang.startsWith("es")) {
      return "es";
    } else if (browserLang.startsWith("ja")) {
      return "ja";
    } else if (browserLang.startsWith("de")) {
      return "de";
    } else if (browserLang.startsWith("fr")) {
      return "fr";
    } else if (browserLang.startsWith("pt")) {
      return "pt";
    } else if (browserLang.startsWith("ru")) {
      return "ru";
    } else if (browserLang.startsWith("ko")) {
      return "ko";
    }
    return "en";
  }

  // 检查缓存是否有效
  isCacheValid() {
    return Date.now() - this.lastCacheTime < this.cacheTimeout;
  }

  // 批量获取所有设置
  async getAllSettings() {
    // 如果缓存有效，直接返回缓存
    if (this.isCacheValid() && this.cache.size > 0) {
      return Object.fromEntries(this.cache);
    }

    try {
      // 一次性获取所有设置
      const result = await chrome.storage.sync.get();

      // 合并默认值
      const settings = { ...this.defaults, ...result };

      // 处理向后兼容性
      if (result.removeParams !== undefined && result.urlCleaning === undefined) {
        settings.urlCleaning = result.removeParams ? 'smart' : 'off';
      }

      // 更新缓存
      this.cache.clear();
      Object.entries(settings).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
      this.lastCacheTime = Date.now();

      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return this.defaults;
    }
  }

  // 获取单个设置
  async getSetting(key) {
    const settings = await this.getAllSettings();
    return settings[key] ?? this.defaults[key];
  }

  // 批量更新设置
  async updateSettings(updates) {
    try {
      await chrome.storage.sync.set(updates);

      // 更新缓存
      Object.entries(updates).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
      this.lastCacheTime = Date.now();

      return true;
    } catch (error) {
      console.error('Failed to update settings:', error);
      return false;
    }
  }

  // 更新单个设置
  async updateSetting(key, value) {
    return this.updateSettings({ [key]: value });
  }

  // 清除缓存
  clearCache() {
    this.cache.clear();
    this.lastCacheTime = 0;
  }

  // 获取设置子集
  async getSettings(keys) {
    const allSettings = await this.getAllSettings();
    const result = {};
    keys.forEach(key => {
      result[key] = allSettings[key];
    });
    return result;
  }
}

// 创建单例实例
const settingsManager = new SettingsManager();

export default settingsManager;
