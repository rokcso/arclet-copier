// Background script for handling keyboard shortcuts and URL copying

import { processUrl, getMessage } from "../shared/constants.js";

// Constants
const EXTENSION_NAME = chrome.i18n.getMessage("extName");

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "copy-current-url",
    title: chrome.i18n.getMessage("copyCurrentUrl") || "复制当前 URL",
    contexts: [
      "page",
      "frame",
      "selection",
      "link",
      "editable",
      "image",
      "video",
      "audio",
    ],
  });
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "copy-current-url") {
    await handleCopyUrl();
  }
});

// 监听键盘快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    await handleCopyUrl();
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "copyFromPopup") {
    copyToClipboard(message.text)
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
    throw new Error(getMessage("noUrl"));
  }

  return tab;
}

// 获取用户设置
async function getUserSettings() {
  const settings = await chrome.storage.sync.get([
    "removeParams",
    "urlCleaning",
    "silentCopyFormat",
  ]);

  // 处理向后兼容：将旧的boolean设置转换为新的字符串设置
  let cleaningMode = settings.urlCleaning;
  if (!cleaningMode && typeof settings.removeParams === "boolean") {
    cleaningMode = settings.removeParams ? "aggressive" : "off";
  }
  cleaningMode = cleaningMode || "smart";

  return {
    urlCleaning: cleaningMode,
    silentCopyFormat: settings.silentCopyFormat || "url",
  };
}

// 获取页面标题
async function getPageTitle(tabId, url) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || new URL(url).hostname || "";
  } catch (error) {
    console.error("获取页面标题失败:", error);
    // 如果获取tab失败，尝试从URL生成标题
    try {
      return new URL(url).hostname || "";
    } catch (urlError) {
      return "";
    }
  }
}

// 创建 markdown 链接格式
function createMarkdownLink(url, title, cleaningMode) {
  const processedUrl = processUrl(url, cleaningMode);
  const linkTitle = title || new URL(url).hostname;
  return `[${linkTitle}](${processedUrl})`;
}

// 处理URL复制功能
async function handleCopyUrl() {
  try {
    const tab = await getCurrentTab();
    const settings = await getUserSettings();

    let contentToCopy;
    let successMessage;

    if (settings.silentCopyFormat === "markdown") {
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = createMarkdownLink(tab.url, title, settings.urlCleaning);
      successMessage = getMessage("markdownLinkCopied");
    } else {
      // 默认复制 URL
      contentToCopy = processUrl(tab.url, settings.urlCleaning);
      successMessage = getMessage("urlCopied");
    }

    await copyToClipboard(contentToCopy);
    showNotification(EXTENSION_NAME, successMessage);
  } catch (error) {
    console.error("复制 URL 失败:", error);
    const message =
      error.message === getMessage("noUrl")
        ? getMessage("noUrl")
        : getMessage("copyFailed");
    showNotification(EXTENSION_NAME, message);
  }
}

// 复制到剪贴板 - 使用 offscreen document
async function copyToClipboard(text) {
  try {
    // 确保 offscreen document 存在
    await ensureOffscreenDocument();

    // 向 offscreen document 发送复制消息
    const response = await chrome.runtime.sendMessage({
      action: "copy",
      text: text,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Offscreen copy failed");
    }

    console.log("Offscreen copy successful");
  } catch (error) {
    console.error("复制失败:", error);
    throw new Error("复制操作失败");
  }
}

// 确保 offscreen document 存在
async function ensureOffscreenDocument() {
  try {
    // 检查是否已存在 offscreen document
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (existingContexts.length === 0) {
      // 创建 offscreen document
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen/offscreen.html"),
        reasons: ["CLIPBOARD"],
        justification: "复制文本到剪贴板",
      });
      console.log("Offscreen document created");
    }
  } catch (error) {
    console.error("Failed to create offscreen document:", error);
    throw error;
  }
}

// 显示通知
function showNotification(title, message) {
  const notificationOptions = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
    title,
    message,
  };

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
