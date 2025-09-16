// 剪贴板服务

import { DOMUtils } from "../shared/utils.js";

export class ClipboardService {
  // 从background script复制到剪贴板 - 使用 offscreen document
  static async copyFromBackground(text) {
    try {
      console.log("开始创建 offscreen document...");
      // 确保 offscreen document 存在
      await this.ensureOffscreenDocument();

      console.log("向 offscreen document 发送复制消息...", text);
      // 向 offscreen document 发送复制消息
      const response = await chrome.runtime.sendMessage({
        action: "copy",
        text: text,
      });

      console.log("收到 offscreen 响应:", response);

      if (!response || !response.success) {
        throw new Error(response?.error || "Offscreen copy failed");
      }

      console.log("Offscreen copy successful");
    } catch (error) {
      console.error("复制失败:", error);
      throw new Error(`复制操作失败: ${error.message}`);
    }
  }

  // 从popup复制到剪贴板
  static async copyFromPopup(text) {
    try {
      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        console.log("Popup clipboard API copy successful");
        return;
      } else {
        // 使用fallback方法
        this.fallbackCopy(text);
      }
    } catch (error) {
      console.error("复制失败:", error);
      // 尝试fallback方法
      try {
        this.fallbackCopy(text);
      } catch (fallbackError) {
        console.error("降级复制也失败:", fallbackError);
        throw fallbackError;
      }
    }
  }

  // 使用execCommand复制的备用方法
  static fallbackCopy(text) {
    const textArea = DOMUtils.createTempCopyElement(text);
    document.body.appendChild(textArea);

    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (!successful) {
      throw new Error("execCommand copy failed");
    }

    console.log("Popup execCommand copy successful");
  }

  // 确保 offscreen document 存在 (仅在background script中使用)
  static async ensureOffscreenDocument() {
    try {
      // 检查是否已存在 offscreen document
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });

      console.log("现有 offscreen contexts:", existingContexts.length);

      if (existingContexts.length === 0) {
        // 创建 offscreen document
        const offscreenUrl = chrome.runtime.getURL("html/offscreen.html");
        console.log("创建 offscreen document:", offscreenUrl);

        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ["CLIPBOARD"],
          justification: "复制文本到剪贴板",
        });
        console.log("Offscreen document created successfully");
      } else {
        console.log("Offscreen document already exists");
      }
    } catch (error) {
      console.error(
        "Failed to create offscreen document:",
        error.message || error,
      );
      throw new Error(`无法创建 offscreen document: ${error.message || error}`);
    }
  }
}
