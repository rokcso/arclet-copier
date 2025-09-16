// 统一存储管理

import { EXTENSION_CONFIG } from './constants.js';

export class StorageManager {
  // 获取用户设置
  static async getUserSettings() {
    const settings = await chrome.storage.sync.get([
      "removeParams",
      "urlCleaning",
      "silentCopyFormat",
      "appearance",
      "language",
    ]);

    // 处理向后兼容：将旧的boolean设置转换为新的字符串设置
    let cleaningMode = settings.urlCleaning;
    if (!cleaningMode && typeof settings.removeParams === "boolean") {
      cleaningMode = settings.removeParams ? "aggressive" : "off";
    }
    cleaningMode = cleaningMode || EXTENSION_CONFIG.DEFAULT_SETTINGS.urlCleaning;

    // 设置默认语言
    const browserLang = chrome.i18n.getUILanguage();
    const defaultLang = browserLang.startsWith("zh") ? "zh_CN" : "en";
    const savedLanguage = settings.language || defaultLang;

    return {
      urlCleaning: cleaningMode,
      silentCopyFormat: settings.silentCopyFormat || EXTENSION_CONFIG.DEFAULT_SETTINGS.silentCopyFormat,
      appearance: settings.appearance || EXTENSION_CONFIG.DEFAULT_SETTINGS.appearance,
      language: savedLanguage,
    };
  }

  // 保存用户设置
  static async saveUserSettings(newSettings) {
    await chrome.storage.sync.set(newSettings);
  }

  // 获取单个设置值
  static async getSetting(key, defaultValue = null) {
    const result = await chrome.storage.sync.get([key]);
    return result[key] !== undefined ? result[key] : defaultValue;
  }

  // 保存单个设置值
  static async saveSetting(key, value) {
    await chrome.storage.sync.set({ [key]: value });
  }
}
