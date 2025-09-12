// Background script for handling keyboard shortcuts and URL copying

// Constants
const EXTENSION_NAME = chrome.i18n.getMessage("extName");

// i18n helper function
function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions);
}

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
    "silentCopyFormat",
  ]);
  return {
    removeParams: settings.removeParams || false,
    silentCopyFormat: settings.silentCopyFormat || "url",
  };
}

// 检查是否为特殊页面 (chrome://, edge://, about: 等内部页面)
function isRestrictedPage(url) {
  if (!url) return true;
  const restrictedProtocols = [
    "chrome:",
    "chrome-extension:",
    "edge:",
    "about:",
    "moz-extension:",
  ];
  return restrictedProtocols.some((protocol) => url.startsWith(protocol));
}

// 获取页面标题
async function getPageTitle(tabId, url) {
  try {
    // 对于受限页面，尝试从tab信息获取标题
    if (isRestrictedPage(url)) {
      const tab = await chrome.tabs.get(tabId);
      return tab.title || new URL(url).hostname || "";
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    });
    return results[0]?.result || "";
  } catch (error) {
    console.error("获取页面标题失败:", error);
    // 获取标题失败时，尝试从URL生成标题
    try {
      return new URL(url).hostname || "";
    } catch {
      return "";
    }
  }
}

// 创建 markdown 链接格式
function createMarkdownLink(url, title, removeParams) {
  const processedUrl = processUrl(url, removeParams);
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
      contentToCopy = createMarkdownLink(tab.url, title, settings.removeParams);
      successMessage = getMessage("markdownLinkCopied");
    } else {
      // 默认复制 URL
      contentToCopy = processUrl(tab.url, settings.removeParams);
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

// 处理URL参数
function processUrl(url, removeParams) {
  if (!removeParams) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (error) {
    console.error("URL 处理失败:", error);
    return url;
  }
}

// 创建临时textarea用于复制
function createCopyElement(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");
  return textarea;
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
        url: chrome.runtime.getURL("offscreen.html"),
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
    iconUrl: "icons/icon128.png",
    title,
    message,
  };

  chrome.notifications.create(notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error("通知创建失败:", chrome.runtime.lastError);
    }
  });
}
