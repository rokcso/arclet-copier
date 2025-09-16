// URL处理服务

import { PARAM_CATEGORIES } from '../shared/constants.js';
import { UrlUtils } from '../shared/utils.js';

export class UrlProcessor {
  // 判断参数是否应该保留
  static shouldKeepParameter(paramName, cleaningMode) {
    const lowerParam = paramName.toLowerCase();

    // 功能性参数总是保留
    if (PARAM_CATEGORIES.FUNCTIONAL.includes(lowerParam)) {
      return true;
    }

    // 跟踪参数的处理
    if (PARAM_CATEGORIES.TRACKING.includes(lowerParam)) {
      return false; // 跟踪参数总是移除
    }

    // 根据清理模式处理其他参数
    switch (cleaningMode) {
      case "off":
        return true; // 不清理，保留所有参数
      case "smart":
        return true; // 智能清理，保留未知参数（安全第一）
      case "aggressive":
        return false; // 激进清理，移除所有非功能性参数
      default:
        return true;
    }
  }

  // 智能处理URL参数
  static processUrl(url, cleaningMode = "smart") {
    if (!url || cleaningMode === "off") {
      return url;
    }

    try {
      const urlObj = new URL(url);

      // 激进模式：移除所有查询参数（保持向后兼容）
      if (cleaningMode === "aggressive") {
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      }

      // 智能模式：只移除跟踪参数
      if (cleaningMode === "smart") {
        const params = new URLSearchParams(urlObj.search);
        const newParams = new URLSearchParams();

        for (const [key, value] of params.entries()) {
          if (this.shouldKeepParameter(key, cleaningMode)) {
            newParams.append(key, value);
          }
        }

        urlObj.search = newParams.toString();
        return urlObj.toString();
      }

      return url;
    } catch (error) {
      return url;
    }
  }

  // 创建 markdown 链接格式
  static createMarkdownLink(url, title, cleaningMode = "smart") {
    const processedUrl = this.processUrl(url, cleaningMode);
    const linkTitle = title || UrlUtils.generateTitleFromUrl(url);
    return `[${linkTitle}](${processedUrl})`;
  }
}
