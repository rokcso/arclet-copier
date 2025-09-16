// Background script for handling keyboard shortcuts and URL copying
// 使用模块化架构重构

import { EXTENSION_CONFIG } from "./shared/constants.js";
import { I18nUtils, UrlUtils } from "./shared/utils.js";
import { StorageManager } from "./shared/storage-manager.js";
import { UrlProcessor } from "./services/url-processor.js";
import { ClipboardService } from "./services/clipboard-service.js";

// 监听键盘快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    await handleCopyUrl();
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "copyFromPopup") {
    ClipboardService.copyFromBackground(message.text)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Popup copy failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // 表示会异步发送响应
  }
});

// 获取当前活动标签页
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.url) {
    throw new Error(I18nUtils.getMessage("noUrl"));
  }

  return tab;
}

// 获取页面标题
async function getPageTitle(tabId, url) {
  try {
    // 对于受限页面，尝试从tab信息获取标题
    if (UrlUtils.isRestrictedPage(url)) {
      const tab = await chrome.tabs.get(tabId);
      return tab.title || UrlUtils.generateTitleFromUrl(url) || "";
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    });
    return results[0]?.result || "";
  } catch (error) {
    console.error("获取页面标题失败:", error);
    // 获取标题失败时，尝试从URL生成标题
    return UrlUtils.generateTitleFromUrl(url);
  }
}

// 处理URL复制功能
async function handleCopyUrl() {
  try {
    const tab = await getCurrentTab();
    const settings = await StorageManager.getUserSettings();

    let contentToCopy;
    let successMessage;

    if (settings.silentCopyFormat === "markdown") {
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = UrlProcessor.createMarkdownLink(
        tab.url,
        title,
        settings.urlCleaning,
      );
      successMessage =
        I18nUtils.getMessage("markdownLinkCopied") || "Markdown 链接已复制";
    } else {
      // 默认复制 URL
      contentToCopy = UrlProcessor.processUrl(tab.url, settings.urlCleaning);
      successMessage = I18nUtils.getMessage("urlCopied") || "URL 已复制";
    }

    console.log("准备复制内容:", contentToCopy);
    console.log("通知消息:", successMessage);

    await ClipboardService.copyFromBackground(contentToCopy);
    showNotification(EXTENSION_CONFIG.NAME, successMessage);
  } catch (error) {
    console.error("复制 URL 失败:", error);
    const message =
      error.message === I18nUtils.getMessage("noUrl")
        ? I18nUtils.getMessage("noUrl")
        : I18nUtils.getMessage("copyFailed");
    showNotification(EXTENSION_CONFIG.NAME, message);
  }
}

// 显示通知
function showNotification(title, message) {
  // 确保 title 和 message 都有值
  const safeTitle = title || "Arclet Copier";
  const safeMessage = message || "操作完成";

  const notificationOptions = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    title: safeTitle,
    message: safeMessage,
  };

  console.log("创建通知，图标路径:", notificationOptions.iconUrl);

  chrome.notifications.create(notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error(
        "通知创建失败:",
        chrome.runtime.lastError.message || chrome.runtime.lastError,
      );
    } else {
      console.log("通知创建成功:", notificationId);
    }
  });
}
