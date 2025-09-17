// Background script for handling keyboard shortcuts and URL copying

import {
  processUrl,
  getMessage,
  createShortUrl,
  isValidWebUrl,
} from "../shared/constants.js";

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
  } else if (message.action === "createShortUrl") {
    handleCreateShortUrl(message.url, message.service)
      .then((shortUrl) => sendResponse({ success: true, shortUrl }))
      .catch((error) => {
        console.error("Short URL creation failed:", error);
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
    "chromeNotifications",
    "shortUrlService",
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
    chromeNotifications: settings.chromeNotifications !== false,
    shortUrlService: settings.shortUrlService || "isgd",
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

// 处理短链生成
async function handleCreateShortUrl(longUrl, service) {
  try {
    // 验证URL是否适合生成短链
    if (!isValidWebUrl(longUrl)) {
      throw new Error(
        getMessage("invalidUrlForShortening") ||
          "URL is not suitable for shortening",
      );
    }

    const settings = await getUserSettings();
    const serviceToUse = service || settings.shortUrlService;

    // 应用URL清理规则
    const cleanedUrl = processUrl(longUrl, settings.urlCleaning);

    // 再次验证清理后的URL
    if (!isValidWebUrl(cleanedUrl)) {
      throw new Error(
        getMessage("invalidUrlForShortening") ||
          "Cleaned URL is not suitable for shortening",
      );
    }

    // 生成短链
    const shortUrl = await createShortUrl(cleanedUrl, serviceToUse);

    console.log(`Short URL created: ${shortUrl}`);
    return shortUrl;
  } catch (error) {
    console.error("Failed to create short URL:", error);
    throw error;
  }
}

// 处理URL复制功能
async function handleCopyUrl() {
  let settings;

  try {
    const tab = await getCurrentTab();
    settings = await getUserSettings();

    let contentToCopy;
    let successMessage;

    if (settings.silentCopyFormat === "markdown") {
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = createMarkdownLink(tab.url, title, settings.urlCleaning);
      successMessage = getMessage("markdownLinkCopied");
    } else if (settings.silentCopyFormat === "shortUrl") {
      // 验证URL是否适合生成短链
      if (!isValidWebUrl(tab.url)) {
        throw new Error(
          getMessage("invalidUrlForShortening") ||
            "URL is not suitable for shortening",
        );
      }
      // 生成短链
      const shortUrl = await handleCreateShortUrl(
        tab.url,
        settings.shortUrlService,
      );
      contentToCopy = shortUrl;
      successMessage = getMessage("shortUrlCopied");
    } else {
      // 默认复制 URL
      contentToCopy = processUrl(tab.url, settings.urlCleaning);
      successMessage = getMessage("urlCopied");
    }

    await copyToClipboard(contentToCopy);

    if (settings.chromeNotifications) {
      showNotification(EXTENSION_NAME, successMessage);
    }
  } catch (error) {
    // 如果settings未获取到，尝试重新获取或使用默认设置
    if (!settings) {
      try {
        settings = await getUserSettings();
      } catch (settingsError) {
        console.error("获取设置失败:", settingsError);
        // 使用默认设置
        settings = { chromeNotifications: true, silentCopyFormat: "url" };
      }
    }

    let message;
    let isUserValidationError = false;

    if (error.message === getMessage("noUrl")) {
      message = getMessage("noUrl");
    } else if (settings.silentCopyFormat === "shortUrl") {
      // 根据错误类型选择更具体的消息
      if (
        error.message.includes(getMessage("invalidUrlForShortening")) ||
        error.message.includes("URL is not suitable for shortening")
      ) {
        message = getMessage("invalidUrlForShortening");
        isUserValidationError = true; // 这是用户输入验证错误，不是系统错误
      } else {
        message = getMessage("shortUrlFailed");
      }
    } else {
      message = getMessage("copyFailed");
    }

    // 只有非用户验证错误才打印错误日志
    if (!isUserValidationError) {
      console.error("复制 URL 失败:", error);
    }

    if (settings.chromeNotifications) {
      showNotification(EXTENSION_NAME, message);
    }
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
