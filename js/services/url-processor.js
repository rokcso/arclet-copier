// URL处理服务

import { PARAM_CATEGORIES } from "../shared/constants.js";
import { UrlUtils } from "../shared/utils.js";

export class UrlProcessor {
  // 判断参数是否应该保留
  static shouldKeepParameter(paramName, cleaningMode) {
    const lowerParam = paramName.toLowerCase();

    // 功能性参数总是保留
    if (PARAM_CATEGORIES.FUNCTIONAL.includes(lowerParam)) {
      console.log(
        `    shouldKeepParameter - "${paramName}" 是功能性参数，保留`,
      );
      return true;
    }

    // 跟踪参数的处理
    if (PARAM_CATEGORIES.TRACKING.includes(lowerParam)) {
      console.log(`    shouldKeepParameter - "${paramName}" 是跟踪参数，移除`);
      return false; // 跟踪参数总是移除
    }

    // 根据清理模式处理其他参数
    switch (cleaningMode) {
      case "off":
        console.log(
          `    shouldKeepParameter - "${paramName}" 关闭清理模式，保留`,
        );
        return true; // 不清理，保留所有参数
      case "smart":
        console.log(
          `    shouldKeepParameter - "${paramName}" 智能模式未知参数，保留`,
        );
        return true; // 智能清理，保留未知参数（安全第一）
      case "aggressive":
        console.log(
          `    shouldKeepParameter - "${paramName}" 激进模式未知参数，移除`,
        );
        return false; // 激进清理，移除所有非功能性参数
      default:
        console.log(`    shouldKeepParameter - "${paramName}" 默认保留`);
        return true;
    }
  }

  // 智能处理URL参数
  static processUrl(url, cleaningMode = "smart") {
    console.log(
      `UrlProcessor.processUrl - 输入: URL="${url}", 清理模式="${cleaningMode}"`,
    );

    if (!url || cleaningMode === "off") {
      console.log("UrlProcessor.processUrl - 跳过处理 (没有URL或关闭清理)");
      return url;
    }

    try {
      const urlObj = new URL(url);
      console.log(
        "UrlProcessor.processUrl - 解析URL成功，查询参数:",
        urlObj.search,
      );

      // 激进模式：移除所有查询参数（保持向后兼容）
      if (cleaningMode === "aggressive") {
        const result = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        console.log(
          "UrlProcessor.processUrl - 激进模式，移除所有参数:",
          result,
        );
        return result;
      }

      // 智能模式：只移除跟踪参数
      if (cleaningMode === "smart") {
        const params = new URLSearchParams(urlObj.search);
        const newParams = new URLSearchParams();
        console.log("UrlProcessor.processUrl - 智能模式，处理参数:");

        for (const [key, value] of params.entries()) {
          const shouldKeep = this.shouldKeepParameter(key, cleaningMode);
          console.log(`  参数 "${key}": ${shouldKeep ? "保留" : "移除"}`);

          if (shouldKeep) {
            newParams.append(key, value);
          }
        }

        urlObj.search = newParams.toString();
        const result = urlObj.toString();
        console.log("UrlProcessor.processUrl - 智能模式处理结果:", result);
        return result;
      }

      console.log("UrlProcessor.processUrl - 未知清理模式，返回原URL");
      return url;
    } catch (error) {
      console.error("UrlProcessor.processUrl - URL解析失败:", error);
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
