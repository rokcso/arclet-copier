// Background script for handling keyboard shortcuts and URL copying

// Constants
const EXTENSION_NAME = "Arclet Copier";
const MESSAGES = {
  URL_COPIED: "URL 已复制到剪贴板！",
  COPY_FAILED: "复制失败，请重试",
  NO_URL: "无法获取当前页面 URL",
  NO_TAB: "无法获取当前标签页",
  RESTRICTED_PAGE: "当前页面为系统页面，请点击扩展图标使用复制功能",
};

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
    throw new Error(MESSAGES.NO_URL);
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
    // 如果是特殊页面，跳过脚本注入
    if (isRestrictedPage(url)) {
      return "";
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    });
    return results[0]?.result || "";
  } catch (error) {
    console.error("获取页面标题失败:", error);
    return "";
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

    // 检查是否为特殊页面
    if (isRestrictedPage(tab.url)) {
      showNotification(EXTENSION_NAME, MESSAGES.RESTRICTED_PAGE);
      return;
    }

    const settings = await getUserSettings();

    let contentToCopy;
    let successMessage;

    if (settings.silentCopyFormat === "markdown") {
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = createMarkdownLink(tab.url, title, settings.removeParams);
      successMessage = "Markdown 链接已复制到剪贴板！";
    } else {
      // 默认复制 URL
      contentToCopy = processUrl(tab.url, settings.removeParams);
      successMessage = MESSAGES.URL_COPIED;
    }

    await copyToClipboard(contentToCopy);
    showNotification(EXTENSION_NAME, successMessage);
  } catch (error) {
    console.error("复制 URL 失败:", error);
    const message =
      error.message === MESSAGES.NO_URL
        ? MESSAGES.NO_URL
        : MESSAGES.COPY_FAILED;
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

// 执行复制操作的内容脚本
function copyContentScript(textToCopy) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = textToCopy;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);

    textarea.select();
    textarea.setSelectionRange(0, 99999);

    const success = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!success) {
      throw new Error("execCommand failed");
    }

    return true;
  } catch (error) {
    console.error("Content script copy failed:", error);
    throw error;
  }
}

// 复制到剪贴板 - 使用content script注入
async function copyToClipboard(text) {
  try {
    const tab = await getCurrentTab();

    if (!tab.id) {
      throw new Error(MESSAGES.NO_TAB);
    }

    // 对于特殊页面，这个函数不应该被调用，但如果被调用了就直接抛错
    if (isRestrictedPage(tab.url)) {
      throw new Error("Cannot inject script into restricted page");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyContentScript,
      args: [text],
    });

    console.log("Content script copy successful");
  } catch (error) {
    console.error("Content script 复制失败:", error);
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
