// 通用工具函数

import { RESTRICTED_PROTOCOLS } from './constants.js';

// i18n 工具
export const I18nUtils = {
  getMessage(key, substitutions = []) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }
};

// URL 工具
export const UrlUtils = {
  // 检查是否为特殊页面 (chrome://, edge://, about: 等内部页面)
  isRestrictedPage(url) {
    if (!url) return true;
    return RESTRICTED_PROTOCOLS.some((protocol) => url.startsWith(protocol));
  },

  // 从URL生成标题
  generateTitleFromUrl(url) {
    try {
      return new URL(url).hostname || "";
    } catch {
      return "";
    }
  }
};

// DOM 工具
export const DOMUtils = {
  // 创建临时复制元素
  createTempCopyElement(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.setAttribute("readonly", "");
    return textArea;
  }
};

// 验证工具
export const ValidationUtils = {
  // 验证URL格式
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }
};
