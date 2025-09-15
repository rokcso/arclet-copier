// Background script for handling keyboard shortcuts and URL copying

// Constants
const EXTENSION_NAME = chrome.i18n.getMessage("extName");

// URL参数分类定义
const PARAM_CATEGORIES = {
  // 跟踪参数 - 可以安全移除
  TRACKING: [
    // UTM 系列
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    // 社交媒体跟踪
    "fbclid",
    "igshid",
    "gclid",
    "msclkid",
    "dclid",
    "wbraid",
    "gbraid",
    // 分析工具
    "ref",
    "referrer",
    "source",
    "campaign",
    "medium",
    // 其他常见跟踪
    "spm",
    "from",
    "share_from",
    "tt_from",
    "tt_medium",
    "share_token",
  ],

  // 功能性参数 - 应该保留
  FUNCTIONAL: [
    "page",
    "p",
    "offset",
    "limit",
    "size",
    "per_page", // 分页
    "sort",
    "order",
    "orderby",
    "direction",
    "sort_by", // 排序
    "q",
    "query",
    "search",
    "keyword",
    "filter",
    "s", // 搜索筛选
    "tab",
    "view",
    "mode",
    "type",
    "category",
    "section", // 界面状态
    "id",
    "uid",
    "token",
    "key",
    "code",
    "lang",
    "locale", // 功能标识
  ],
};

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
function createMarkdownLink(url, title, cleaningMode) {
  const processedUrl = processUrl(url, cleaningMode);
  const linkTitle = title || new URL(url).hostname;
  return `[${linkTitle}](${processedUrl})`;
}

// 判断参数是否应该保留
function shouldKeepParameter(paramName, cleaningMode) {
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
function processUrl(url, cleaningMode = "smart") {
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
        if (shouldKeepParameter(key, cleaningMode)) {
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
